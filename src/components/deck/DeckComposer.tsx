import { useId, type ReactNode } from "react";
import "@/styles/deck-composer.css";

export interface DeckComposerGoal {
  id: string;
  title: string;
  /** What the goal answers. */
  description: string;
  icon?: ReactNode;
  disabled?: boolean | undefined;
  /** A short tag next to the title, e.g. why the goal is unavailable. */
  badge?: string | undefined;
}
export interface DeckComposerGoalGroup {
  id: string;
  title: string;
  /** Shown instead of goals when the group has none. */
  empty?: string | undefined;
  goals: readonly DeckComposerGoal[];
}

export interface DeckComposerProps {
  goalGroups: readonly DeckComposerGoalGroup[];
  selectedGoal: string;
  onGoalChange: (id: string) => void;
  labels: { setup: string; collection: string; goal: string; conditions: string; results: string };
  collection: ReactNode;
  conditions: ReactNode;
  /** The run button, its blockers and engine notices; it stays at the foot of the setup. */
  run: ReactNode;
  results: ReactNode;
}

/**
 * The deck workbench: the setup (card pool, goal, conditions, run) beside the results. Wide containers keep the setup in
 * view while the results scroll; narrow ones stack them with the run action pinned to the bottom of the screen. The
 * caller owns every fact, constraint, modal and action.
 */
export default function DeckComposer({ goalGroups, selectedGoal, onGoalChange, labels, collection, conditions, run, results }: DeckComposerProps) {
  const id = useId();
  const selected = goalGroups.flatMap(group => group.goals).find(goal => goal.id === selectedGoal);
  return <div className="dc-composer">
    <div className="dc-bench">
      <aside className="dc-setup" aria-label={labels.setup}>
        <div className="dc-setup-body">
          <section className="dc-block dc-collection" aria-labelledby={`${id}-collection`}>
            <h2 id={`${id}-collection`}>{labels.collection}</h2>
            {collection}
          </section>
          <section className="dc-block dc-goal-section" aria-labelledby={`${id}-goal`}>
            <h2 id={`${id}-goal`}>{labels.goal}</h2>
            {goalGroups.map(group => <div className="dc-goal-group" key={group.id} role="group" aria-labelledby={`${id}-goal-${group.id}`}>
              <h3 className="dc-goal-group-title" id={`${id}-goal-${group.id}`}>{group.title}</h3>
              {group.goals.length ? <div className="dc-goals">{group.goals.map(goal => <button className="dc-goal md3-state" type="button" key={goal.id} aria-pressed={selectedGoal === goal.id}
                disabled={goal.disabled} onClick={() => onGoalChange(goal.id)} title={goal.description}>
                {goal.icon && <span className="dc-goal-icon" aria-hidden="true">{goal.icon}</span>}
                <span className="dc-goal-title">{goal.title}</span>
                {goal.badge && <span className="dc-goal-badge">{goal.badge}</span>}
              </button>)}</div> : group.empty && <p className="dc-goal-empty">{group.empty}</p>}
            </div>)}
            {selected && <p className="dc-goal-description" aria-live="polite">{selected.description}</p>}
          </section>
          <section className="dc-block dc-settings" aria-labelledby={`${id}-conditions`}>
            <h2 id={`${id}-conditions`}>{labels.conditions}</h2>
            <div className="dc-conditions">{conditions}</div>
          </section>
        </div>
        <div className="dc-run">{run}</div>
      </aside>
      <section className="dc-results dc-team" aria-labelledby={`${id}-results`}>
        <h2 id={`${id}-results`} className="dc-results-title">{labels.results}</h2>
        {results}
      </section>
    </div>
  </div>;
}
