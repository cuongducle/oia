import { useMemo, useState } from "react";
import { QUICK_TOOLS, type QuickTool } from "../lib/tools-registry.js";
import { ToolRunner } from "../components/ToolRunner.js";

/**
 * reorg step 4c — the Toolbox view (web /toolbox + /tools/[slug] in one): category
 * grid on the left of the flow, selected tool with its runner below. Pure EN UI.
 */

const CATEGORY_TITLES: Record<QuickTool["category"], string> = {
  "Converter": "File converters",
  "Image Editor": "Image editing",
  "Creative AI": "Creative AI",
  "Image Generator": "Images & charts",
};

export function Tools({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const tool = useMemo(() => QUICK_TOOLS.find((t) => t.slug === selected), [selected]);

  if (tool) {
    return (
      <main className="studioPage toolsView" data-testid="tools-view">
        <div className="studioTopline"><span>Toolbox</span><span className="privateNote">{tool.category}</span></div>
        <button className="ghostBtn" onClick={() => setSelected(null)}>← All tools</button>
        <header className="sectionHeading" style={{ marginTop: 18 }}>
          <div>
            <h1>{tool.name}</h1>
            <p>{tool.desc}</p>
          </div>
        </header>
        <ToolRunner kind={tool.kind} onOpenProject={onOpenProject} />
        {!tool.implemented && <p className="hintP" style={{ marginTop: 16 }}>This tool is coming soon.</p>}
      </main>
    );
  }

  const categories = Object.keys(CATEGORY_TITLES) as QuickTool["category"][];
  return (
    <main className="studioPage toolsView" data-testid="tools-view">
      <div className="studioTopline"><span>Toolbox</span><span className="privateNote">The right tool for every part of your creative process</span></div>
      <header className="studioHero" style={{ marginBottom: 34 }}>
        <h1>Quick tools.</h1>
        <p>Convert, resize, chart, and create — without leaving the app.</p>
      </header>
      {categories.map((cat) => (
        <section key={cat} className="toolSection" aria-labelledby={`cat-${cat}`}>
          <h2 id={`cat-${cat}`}>{CATEGORY_TITLES[cat]}</h2>
          <div className="toolGrid">
            {QUICK_TOOLS.filter((t) => t.category === cat).map((t) => (
              <button key={t.slug} className="toolCard" onClick={() => setSelected(t.slug)} aria-label={`Open ${t.name}`}>
                <div className="toolCardBody">
                  <h3>
                    {t.name}
                    {!t.implemented && <span className="availability">Coming soon</span>}
                  </h3>
                  <p>{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
