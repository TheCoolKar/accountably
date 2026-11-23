import { WelcomeActions } from "@/components/app/welcome-actions";

export default function WelcomePage() {
  return (
    <main className="flex flex-1 flex-col justify-between gap-10 pb-6">
      <div className="flex flex-col gap-6 pt-8">
        <h1 className="font-heading text-5xl leading-[1.05] font-extrabold tracking-tight">
          Lock in
          <br />
          <span className="text-primary">together.</span>
        </h1>
        <p className="text-lg text-muted-foreground">
          Set your goals for the week with a few friends. Everyone sees who&apos;s following
          through, and you review the week together.
        </p>

        <ol className="mt-2 flex flex-col gap-3">
          {[
            ["Lock in", "Pick 3 to 5 goals for the week."],
            ["Make progress", "Tick things off. Your squad sees it live."],
            ["Recap", "Look back on Sunday, then go again."],
          ].map(([title, text], index) => (
            <li key={title} className="flex items-baseline gap-3">
              <span className="font-heading text-sm font-bold text-primary tabular-nums">
                {index + 1}
              </span>
              <span>
                <span className="font-semibold">{title}.</span>{" "}
                <span className="text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <WelcomeActions />
    </main>
  );
}
