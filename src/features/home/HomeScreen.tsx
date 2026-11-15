import { useTranslation } from "react-i18next";
import { TaskRow } from "../../components/TaskRow/TaskRow";
import type { ScreenId } from "../../navigation/screens";
import { TaskSpecimen } from "./TaskSpecimen";
import type { SpecimenTask } from "./TaskSpecimen";
import "./HomeScreen.css";

interface TaskDefinition {
  id: SpecimenTask;
  /** Target screen; absent while the feature is unimplemented. */
  screen?: ScreenId;
}

const TASKS: TaskDefinition[] = [
  { id: "match", screen: "match" },
  { id: "convert", screen: "convert" },
  { id: "sync", screen: "sync" },
  { id: "translate", screen: "translate" },
];

interface HomeScreenProps {
  onOpenTask: (screen: ScreenId) => void;
}

export function HomeScreen({ onOpenTask }: HomeScreenProps) {
  const { t } = useTranslation("home");

  return (
    <div className="home">
      <h1 className="home__heading">{t("heading")}</h1>

      {/* `role="list"` survives `list-style: none` in WebKit, which drops it. */}
      <ol className="home__tasks" role="list">
        {TASKS.map((task, index) => (
          <li key={task.id} className="home__task">
            <TaskRow
              ordinal={index + 1}
              name={t(`tasks.${task.id}.name`)}
              description={t(`tasks.${task.id}.description`)}
              specimen={<TaskSpecimen task={task.id} />}
              disabled={task.screen === undefined}
              onSelect={task.screen ? () => onOpenTask(task.screen as ScreenId) : undefined}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
