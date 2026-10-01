//! The requests waiting for an answer and the steps each session has taken (SPEC-claude-approvals §4.3–4.6).
//!
//! Plain bookkeeping with no pipe and no window in it, so every rule is tested directly. All of it lives in
//! memory only: a command line or a file name is never written anywhere.

use std::collections::{BTreeMap, VecDeque};
use std::sync::mpsc::{channel, Receiver, Sender};

use serde::Serialize;

/// More than this waiting at once is not a queue anyone is working through; the rest go to the terminal.
pub const MAX_PENDING: usize = 16;
/// Steps kept for each session, and how many sessions are remembered.
pub const MAX_STEPS: usize = 6;
pub const MAX_SESSIONS: usize = 24;

/// What the person at the notch said.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Answer {
    Allow,
    Deny,
    /// No decision: the terminal takes the question.
    Release,
}

impl Answer {
    pub fn parse(raw: &str) -> Option<Answer> {
        match raw {
            "allow" => Some(Answer::Allow),
            "deny" => Some(Answer::Deny),
            "release" => Some(Answer::Release),
            _ => None,
        }
    }
}

/// One request as the page sees it (SPEC §6).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Approval {
    pub id: String,
    pub session_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    pub tool: String,
    pub summary: String,
    /// `summary` is the entire request: the pill may offer to allow it without the card being opened.
    pub complete: bool,
    pub detail: String,
    pub truncated: bool,
    pub received_at: u64,
}

/// An id nobody can guess from having seen another one.
///
/// A request is answered by naming its id. Counting up from 1 would let anything able to call the command answer
/// a request it was never shown; `RandomState` is keyed from the operating system's random source, which is all
/// the randomness this needs without bringing in a crate for it.
fn fresh_id() -> String {
    use std::hash::{BuildHasher, Hasher};
    let half = || {
        std::collections::hash_map::RandomState::new()
            .build_hasher()
            .finish()
    };
    format!("{:016x}{:016x}", half(), half())
}

struct Waiting {
    view: Approval,
    tool_use_id: String,
    /// The page has confirmed the pill is up (SPEC §4.3).
    shown: bool,
    answer: Sender<Answer>,
}

#[derive(Default)]
pub struct Book {
    waiting: Vec<Waiting>,
    /// Newest session last, so the one forgotten first is the one that has been quiet longest.
    steps: VecDeque<(String, VecDeque<String>)>,
}

impl Book {
    /// Registers a request and hands back its id and the end of the channel its answer arrives on.
    /// `None` when too many are already waiting.
    pub fn open(
        &mut self,
        mut view: Approval,
        tool_use_id: String,
    ) -> Option<(String, Receiver<Answer>)> {
        if self.waiting.len() >= MAX_PENDING {
            return None;
        }
        let id = fresh_id();
        view.id = id.clone();
        let (answer, receiver) = channel();
        self.waiting.push(Waiting {
            view,
            tool_use_id,
            shown: false,
            answer,
        });
        Some((id, receiver))
    }

    fn take(&mut self, keep: impl Fn(&Waiting) -> bool) -> Vec<Waiting> {
        let (kept, gone): (Vec<_>, Vec<_>) = std::mem::take(&mut self.waiting)
            .into_iter()
            .partition(keep);
        self.waiting = kept;
        gone
    }

    /// Delivers an answer. False when the request is no longer waiting — answered already, timed out, or gone.
    pub fn answer(&mut self, id: &str, answer: Answer) -> bool {
        let gone = self.take(|w| w.view.id != id);
        for waiting in &gone {
            // The handler may have given up a moment ago; a send that finds nobody is not an error.
            let _ = waiting.answer.send(answer);
        }
        !gone.is_empty()
    }

    /// The handler stopped waiting on its own (timeout, client gone). True when the request was still listed.
    pub fn close(&mut self, id: &str) -> bool {
        !self.take(|w| w.view.id != id).is_empty()
    }

    pub fn mark_shown(&mut self, id: &str) {
        if let Some(w) = self.waiting.iter_mut().find(|w| w.view.id == id) {
            w.shown = true;
        }
    }

    pub fn is_shown(&self, id: &str) -> bool {
        self.waiting.iter().any(|w| w.view.id == id && w.shown)
    }

    fn release(&mut self, keep: impl Fn(&Waiting) -> bool) -> usize {
        let gone = self.take(keep);
        for waiting in &gone {
            let _ = waiting.answer.send(Answer::Release);
        }
        gone.len()
    }

    /// The tool ran: whoever was asked about it has answered somewhere else (SPEC §4.4).
    pub fn tool_finished(&mut self, session: &str, tool_use_id: &str) -> usize {
        if tool_use_id.is_empty() {
            return 0;
        }
        self.release(|w| !(w.view.session_id == session && w.tool_use_id == tool_use_id))
    }

    /// The session's turn ended or a new one began: nothing it asked before is still open.
    pub fn turn_over(&mut self, session: &str) -> usize {
        self.release(|w| w.view.session_id != session)
    }

    pub fn list(&self) -> Vec<Approval> {
        self.waiting.iter().map(|w| w.view.clone()).collect()
    }

    /// Adds a step to a session's line. False when it changed nothing worth telling the page about.
    pub fn step(&mut self, session: &str, label: String) -> bool {
        if label.is_empty() {
            return false;
        }
        let mut line = match self.steps.iter().position(|(id, _)| id == session) {
            Some(at) => self
                .steps
                .remove(at)
                .map(|(_, line)| line)
                .unwrap_or_default(),
            None => VecDeque::new(),
        };
        line.push_back(label);
        while line.len() > MAX_STEPS {
            line.pop_front();
        }
        self.steps.push_back((session.to_string(), line));
        while self.steps.len() > MAX_SESSIONS {
            self.steps.pop_front();
        }
        true
    }

    /// A new turn starts from an empty line. True when there was something to clear.
    pub fn clear_steps(&mut self, session: &str) -> bool {
        let before = self.steps.len();
        self.steps.retain(|(id, _)| id != session);
        self.steps.len() != before
    }

    pub fn steps(&self) -> BTreeMap<String, Vec<String>> {
        self.steps
            .iter()
            .map(|(id, line)| (id.clone(), line.iter().cloned().collect()))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(session: &str) -> Approval {
        Approval {
            id: String::new(),
            session_id: session.into(),
            title: "shop".into(),
            project: None,
            tool: "Bash".into(),
            summary: "git push".into(),
            complete: true,
            detail: "command: git push".into(),
            truncated: false,
            received_at: 1,
        }
    }

    #[test]
    fn an_answer_reaches_the_one_request_it_was_for() {
        let mut book = Book::default();
        let (first, first_rx) = book.open(view("s1"), "t1".into()).expect("opens");
        let (second, second_rx) = book.open(view("s2"), "t2".into()).expect("opens");
        assert_ne!(first, second);
        assert_eq!(book.list().len(), 2);
        assert_eq!(
            book.list()[0].id,
            first,
            "the page gets the id it must answer with"
        );

        assert!(book.answer(&second, Answer::Allow));
        assert_eq!(second_rx.try_recv(), Ok(Answer::Allow));
        assert!(
            first_rx.try_recv().is_err(),
            "the other request is still waiting"
        );
        assert_eq!(book.list().len(), 1);

        assert!(
            !book.answer(&second, Answer::Deny),
            "a second click on the same request does nothing"
        );
        assert!(!book.answer("nope", Answer::Allow));
    }

    #[test]
    fn ids_are_long_and_do_not_follow_from_one_another() {
        let mut book = Book::default();
        let ids: Vec<String> = (0..MAX_PENDING)
            .map(|i| book.open(view("s"), format!("t{i}")).expect("opens").0)
            .collect();
        for id in &ids {
            assert_eq!(id.len(), 32, "{id}");
            assert!(id.bytes().all(|b| b.is_ascii_hexdigit()), "{id}");
        }
        let distinct: std::collections::BTreeSet<&String> = ids.iter().collect();
        assert_eq!(distinct.len(), ids.len());
        // Not a counter: the numeric gap between neighbours is never one.
        let as_number = |id: &String| u128::from_str_radix(id, 16).expect("hex");
        assert!(ids
            .windows(2)
            .all(|pair| as_number(&pair[0]).abs_diff(as_number(&pair[1])) > 1));
    }

    #[test]
    fn an_answer_for_a_handler_that_already_left_is_harmless() {
        let mut book = Book::default();
        let (id, rx) = book.open(view("s1"), "t1".into()).expect("opens");
        drop(rx);
        assert!(book.answer(&id, Answer::Allow));
        assert!(book.list().is_empty());
    }

    #[test]
    fn a_handler_that_gives_up_takes_its_request_with_it() {
        let mut book = Book::default();
        let (id, _rx) = book.open(view("s1"), "t1".into()).expect("opens");
        assert!(book.close(&id));
        assert!(!book.close(&id));
        assert!(book.list().is_empty());
    }

    #[test]
    fn the_page_has_to_say_the_pill_is_up() {
        let mut book = Book::default();
        let (id, _rx) = book.open(view("s1"), "t1".into()).expect("opens");
        assert!(!book.is_shown(&id));
        book.mark_shown(&id);
        assert!(book.is_shown(&id));
        book.mark_shown("nope");
        assert!(!book.is_shown("nope"));
    }

    #[test]
    fn a_tool_that_ran_releases_only_its_own_request() {
        let mut book = Book::default();
        let (_, a) = book.open(view("s1"), "t1".into()).expect("opens");
        let (_, b) = book.open(view("s1"), "t2".into()).expect("opens");
        let (_, c) = book.open(view("s2"), "t1".into()).expect("opens");

        assert_eq!(book.tool_finished("s1", "t1"), 1);
        assert_eq!(a.try_recv(), Ok(Answer::Release));
        assert!(
            b.try_recv().is_err(),
            "another call of the same session is still open"
        );
        assert!(
            c.try_recv().is_err(),
            "the same id in another session is somebody else's"
        );
        assert_eq!(
            book.tool_finished("s1", ""),
            0,
            "a hook without an id matches nothing"
        );
        assert_eq!(book.list().len(), 2);
    }

    #[test]
    fn the_end_of_a_turn_releases_everything_that_session_asked() {
        let mut book = Book::default();
        let (_, a) = book.open(view("s1"), "t1".into()).expect("opens");
        let (_, b) = book.open(view("s1"), "t2".into()).expect("opens");
        let (_, c) = book.open(view("s2"), "t3".into()).expect("opens");
        assert_eq!(book.turn_over("s1"), 2);
        assert_eq!(a.try_recv(), Ok(Answer::Release));
        assert_eq!(b.try_recv(), Ok(Answer::Release));
        assert!(c.try_recv().is_err());
        assert_eq!(book.turn_over("s1"), 0);
    }

    #[test]
    fn past_the_limit_a_request_is_refused_rather_than_queued() {
        let mut book = Book::default();
        let held: Vec<_> = (0..MAX_PENDING)
            .map(|i| book.open(view("s"), format!("t{i}")).expect("opens"))
            .collect();
        assert!(book.open(view("s"), "one-too-many".into()).is_none());
        assert!(book.answer(&held[0].0, Answer::Deny));
        assert!(book.open(view("s"), "room-again".into()).is_some());
    }

    #[test]
    fn only_the_three_words_are_answers() {
        assert_eq!(Answer::parse("allow"), Some(Answer::Allow));
        assert_eq!(Answer::parse("deny"), Some(Answer::Deny));
        assert_eq!(Answer::parse("release"), Some(Answer::Release));
        assert_eq!(Answer::parse("always"), None);
        assert_eq!(Answer::parse(""), None);
    }

    #[test]
    fn a_session_keeps_its_last_few_steps() {
        let mut book = Book::default();
        for i in 0..MAX_STEPS + 2 {
            assert!(book.step("s1", format!("step {i}")));
        }
        assert!(
            !book.step("s1", String::new()),
            "an empty label is not a step"
        );
        let steps = book.steps();
        assert_eq!(steps["s1"].len(), MAX_STEPS);
        assert_eq!(steps["s1"][0], "step 2");
        assert_eq!(
            steps["s1"].last().unwrap(),
            &format!("step {}", MAX_STEPS + 1)
        );
    }

    #[test]
    fn a_new_turn_starts_from_an_empty_line() {
        let mut book = Book::default();
        book.step("s1", "Read · a.ts".into());
        book.step("s2", "Bash · ls".into());
        assert!(book.clear_steps("s1"));
        assert!(!book.clear_steps("s1"));
        let steps = book.steps();
        assert!(!steps.contains_key("s1"));
        assert_eq!(steps["s2"], vec!["Bash · ls".to_string()]);
    }

    #[test]
    fn the_session_quiet_longest_is_the_one_forgotten() {
        let mut book = Book::default();
        for i in 0..MAX_SESSIONS {
            book.step(&format!("s{i}"), "x".into());
        }
        // s0 speaks again, so s1 is now the oldest.
        book.step("s0", "y".into());
        book.step("new", "z".into());
        let steps = book.steps();
        assert_eq!(steps.len(), MAX_SESSIONS);
        assert!(steps.contains_key("s0"));
        assert!(!steps.contains_key("s1"));
        assert!(steps.contains_key("new"));
    }
}
