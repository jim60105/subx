import { useTranslation } from "react-i18next";
import { SPECIMENS } from "./specimens";

export type SpecimenTask = "match" | "convert" | "sync" | "translate";

/** Demonstrates what a task does to files, in place of a sentence describing it. */
export function TaskSpecimen({ task }: { task: SpecimenTask }) {
  const { t } = useTranslation("home");

  switch (task) {
    case "match":
      return (
        <>
          <span className="task-specimen__chip">{SPECIMENS.match.video}</span>
          <span className="task-specimen__arrow">⟷</span>
          <span className="task-specimen__chip">{SPECIMENS.match.subtitle}</span>
        </>
      );
    case "convert":
      return (
        <>
          <span className="task-specimen__chip">{SPECIMENS.convert.from}</span>
          <span className="task-specimen__arrow">→</span>
          {SPECIMENS.convert.to.map((extension) => (
            <span key={extension} className="task-specimen__chip">
              {extension}
            </span>
          ))}
        </>
      );
    case "sync":
      return (
        <>
          <span>{SPECIMENS.sync.before}</span>
          <span className="task-specimen__arrow">→</span>
          <span className="task-specimen__after">{SPECIMENS.sync.after}</span>
        </>
      );
    case "translate":
      return (
        <>
          <span className="task-specimen__line">{t("specimens.translate.source")}</span>
          <span className="task-specimen__arrow">→</span>
          <span className="task-specimen__line serif">{t("specimens.translate.target")}</span>
        </>
      );
  }
}
