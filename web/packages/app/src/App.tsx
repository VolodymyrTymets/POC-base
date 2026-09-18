import { Routes, Route, Link } from 'react-router';

function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-brand text-3xl font-bold">poc-base app</h1>
      <p className="text-slate-500">Placeholder home route.</p>
      <Link to="/about" className="text-blue-600 underline">
        About
      </Link>
    </div>
  );
}

function About() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">About</h1>
      <p className="text-slate-500">Placeholder about route.</p>
      <Link to="/" className="text-blue-600 underline">
        Home
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
    </Routes>
  );
}
