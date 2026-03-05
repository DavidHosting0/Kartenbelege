import { AppNav } from "../components/AppNav";

export const SettingsPage = () => {
  return (
    <main className="page">
      <AppNav />
      <header className="topbar">
        <h1>Settings</h1>
        <p className="muted">Workspace and parser preferences.</p>
      </header>
      <section className="card">
        <h2>Workspace Settings</h2>
        <p>Manage OCR defaults, retention, and export preferences from here.</p>
      </section>
    </main>
  );
};
