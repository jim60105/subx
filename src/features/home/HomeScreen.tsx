import { useTranslation } from "react-i18next";
import { TaskCard } from "../../components/TaskCard/TaskCard";
import {
  ConvertIcon,
  MatchIcon,
  SyncIcon,
  TranslateIcon,
} from "../../components/icons/TaskIcons";
import type { ScreenId } from "../../navigation/screens";
import "./HomeScreen.css";

interface TaskDefinition {
  id: "match" | "convert" | "sync" | "translate";
  icon: JSX.Element;
  /** Target screen; absent while the feature is unimplemented. */
  screen?: ScreenId;
}

const TASKS: TaskDefinition[] = [
  { id: "match", icon: <MatchIcon />, screen: "match" },
  { id: "convert", icon: <ConvertIcon /> },
  { id: "sync", icon: <SyncIcon /> },
  { id: "translate", icon: <TranslateIcon /> },
];

interface HomeScreenProps {
  onOpenTask: (screen: ScreenId) => void;
}

export function HomeScreen({ onOpenTask }: HomeScreenProps) {
  const { t } = useTranslation("home");

  return (
    <div className="home">
      <div className="home__intro">
        <h1 className="home__heading">{t("heading")}</h1>
        <p className="home__subheading">{t("subheading")}</p>
      </div>

      <div className="home__grid">
        {TASKS.map((task) => (
          <TaskCard
            key={task.id}
            name={t(`tasks.${task.id}.name`)}
            description={t(`tasks.${task.id}.description`)}
            icon={task.icon}
            disabled={task.screen === undefined}
            onSelect={task.screen ? () => onOpenTask(task.screen as ScreenId) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
