import { Link } from 'react-router-dom';
import PageTransition from '../components/PageTransition.jsx';

export default function NotFoundPage() {
  return (
    <PageTransition className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-mono text-sm text-pen">404</p>
        <h1 className="mt-2 text-4xl font-semibold">This page wasn't in the syllabus.</h1>
        <Link to="/dashboard" className="mt-6 inline-block underline decoration-pen decoration-2 underline-offset-4">
          Back to your notebooks
        </Link>
      </div>
    </PageTransition>
  );
}
