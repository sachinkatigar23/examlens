import { Suspense, lazy, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, ArrowRight, Highlighter, MessageSquareText, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import PaperStackIllustration from '../components/landing/PaperStackIllustration.jsx';
import BlurText from '../components/reactbits/BlurText.jsx';
import CountUp from '../components/reactbits/CountUp.jsx';
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCanAnimate3D } from '../hooks/useCanAnimate3D.js';

// three.js + R3F live in their own chunk: only downloaded when the 3D scene will actually run.
const HeroScene = lazy(() => import('../three/HeroScene.jsx'));

// The story the 3D scene tells, one caption per stage. [start, end] are scroll progress (0..1).
const CHAPTERS = [
  {
    range: [0.2, 0.46],
    kicker: 'Step back',
    title: 'Four years of papers. One pile.',
    text: 'Drop in the syllabus and every past paper you can find. ExamLens reads each question and pins it to a syllabus topic.',
  },
  {
    range: [0.46, 0.72],
    kicker: 'Look closer',
    title: (
      <>
        {/* From the demo data (samples/: four Computer Networks papers, 2022–2025). Keep it true to that data. */}
        <span className="highlighted">Network models</span> came up in all 4 sample papers.{' '}
        <em className="font-normal">Now you know.</em>
      </>
    ),
    text: 'Questions that come back year after year get the highlighter, so the repeats are the first thing you see.',
  },
  {
    range: [0.72, 1],
    kicker: 'All of it',
    title: 'Every topic, every year, on one page.',
    text: 'The Analyzer turns the pile into a heatmap: what is asked every year, what is asked once, what you can safely skim.',
  },
];

export default function LandingPage() {
  const mode = useCanAnimate3D();
  return (
    <div className="min-h-dvh overflow-x-clip">
      <Nav />
      {mode === 'scene' ? <ScrollStory /> : <StaticStory />}
      <Features />
      <Numbers />
      <Steps />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  const { status } = useAuth();
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6" aria-label="Main">
        <Logo to="/" />
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {status === 'authed' ? (
            <Link to="/dashboard" className="rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-paper">
              Open notebooks
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink">Log in</Link>
              <Link to="/register" className="rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-paper">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function HeroCopy() {
  const { status } = useAuth();
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-pen">Exam prep from your own notes</p>
      <BlurText
        as="h1"
        text="Know what's coming. Study what matters."
        trigger="load"
        delay={90}
        blur={8}
        distance={18}
        className="mt-4 max-w-xl font-serif text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl"
      />
      <p className="mt-5 max-w-md text-base text-ink-muted sm:mt-6 sm:text-lg">
        Upload your syllabus, notes and past papers. ExamLens shows which topics keep getting asked, and answers your
        doubts from your own notes, with the page number. It runs on your laptop; nothing leaves it.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to={status === 'authed' ? '/dashboard' : '/register'}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-paper shadow-[0_2px_0_0_rgb(0_0_0/0.25)] transition-transform hover:-translate-y-px"
        >
          {status === 'authed' ? 'Open your notebooks' : 'Start a notebook'} <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <a href="#how" className="rounded-md px-4 py-3 text-ink-muted underline decoration-pen decoration-2 underline-offset-4 hover:text-ink">
          How it works
        </a>
      </div>
    </div>
  );
}

// 3D version: a tall section whose sticky viewport holds the scene; scrolling through it plays the story.
function ScrollStory() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const onScreen = useInView(ref, { margin: '0px 0px 0px 0px' });

  const heroOpacity = useTransform(scrollYProgress, [0, 0.14], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.14], [0, -30]);
  const heroEvents = useTransform(heroOpacity, (o) => (o > 0.4 ? 'auto' : 'none'));
  const hintOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  return (
    <section ref={ref} className="relative h-[420vh]" aria-label="How ExamLens reads your past papers">
      {/* Mobile: the papers on top (40vh), the text below. Desktop: text left, papers right. */}
      <div className="sticky top-0 flex h-dvh flex-col overflow-hidden pt-16 lg:grid lg:grid-cols-[1fr_1.1fr] lg:pt-0">
        <div className="relative z-10 order-2 mx-auto flex w-full max-w-xl px-6 lg:order-none lg:mx-0 lg:ml-auto lg:items-center lg:pr-4">
          <div className="relative w-full lg:min-h-[26rem]">
            <motion.div style={{ opacity: heroOpacity, y: heroY, pointerEvents: heroEvents }} className="lg:absolute lg:inset-x-0 lg:top-1/2 lg:-translate-y-1/2">
              <HeroCopy />
            </motion.div>
            {CHAPTERS.map((c) => (
              <Chapter key={c.kicker} chapter={c} progress={scrollYProgress} />
            ))}
          </div>
        </div>
        <div className="relative order-1 h-[40vh] shrink-0 [filter:drop-shadow(0_14px_22px_rgb(27_42_74/0.18))] lg:order-none lg:h-auto">
          <Suspense fallback={<PaperStackIllustration className="mx-auto h-full max-h-[70vh] w-full p-8" />}>
            <HeroScene progress={scrollYProgress} active={onScreen} />
          </Suspense>
        </div>
        <motion.p
          style={{ opacity: hintOpacity }}
          className="pointer-events-none absolute inset-x-0 bottom-6 hidden items-center justify-center gap-2 font-mono text-xs text-ink-muted lg:flex"
        >
          <ArrowDown size={14} aria-hidden="true" /> Scroll through the pile
        </motion.p>
      </div>
    </section>
  );
}

function Chapter({ chapter, progress }) {
  const [a, b] = chapter.range;
  // Scroll-linked values may be hardware-accelerated by the browser, which only accepts offsets in [0, 1].
  const last = b >= 1;
  const opacity = useTransform(
    progress,
    last ? [a - 0.03, a + 0.03, 1] : [a - 0.03, a + 0.03, b - 0.04, b],
    last ? [0, 1, 1] : [0, 1, 1, 0],
  );
  const y = useTransform(progress, [a - 0.03, a + 0.03], [24, 0]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="pointer-events-none absolute inset-x-0 top-0 lg:top-1/2 lg:-translate-y-1/2"
      aria-hidden="true"
    >
      <ChapterText chapter={chapter} />
    </motion.div>
  );
}

function ChapterText({ chapter }) {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-pen">{chapter.kicker}</p>
      <h2 className="mt-3 max-w-lg text-3xl leading-tight font-medium sm:text-4xl">{chapter.title}</h2>
      <p className="mt-4 max-w-md text-ink-muted">{chapter.text}</p>
    </>
  );
}

// Reduced motion / no WebGL: the same story as plain sections, with a static illustration.
function StaticStory() {
  return (
    <>
      <section className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-6 pt-24 pb-12 lg:grid-cols-2">
        <HeroCopy />
        <PaperStackIllustration className="w-full" />
      </section>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-3" aria-label="How ExamLens reads your past papers">
        {CHAPTERS.map((c) => (
          <div key={c.kicker}>
            <ChapterText chapter={c} />
          </div>
        ))}
      </section>
    </>
  );
}

const FEATURES = [
  {
    Icon: Highlighter,
    title: 'The Analyzer',
    text: 'A topics × years heatmap of your past papers. Hot topics ranked by how many years they came up, then by marks. Repeated questions, circled.',
  },
  {
    Icon: MessageSquareText,
    title: 'Ask your notes',
    text: "Answers written only from the notes you uploaded, every point stuck to its page. If your notes don't cover it, it says so instead of guessing.",
  },
  {
    Icon: ShieldCheck,
    title: 'Stays on your laptop',
    text: 'Runs on local models through Ollama. No cloud upload, no subscription, no one reading your notes.',
  },
];

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="features-title">
      <h2 id="features-title" className="max-w-2xl text-4xl font-semibold">Two tools for the week before the exam.</h2>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {FEATURES.map(({ Icon, title, text }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.3, delay: i * 0.06, ease: 'easeOut' }}
          >
            <SpotlightCard className="h-full" intensity={0.5} spotlightSize={260}>
              <Icon size={22} className="text-pen" aria-hidden="true" />
              <h3 className="mt-4 text-2xl font-semibold">{title}</h3>
              <p className="mt-2 text-ink-muted">{text}</p>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

const NUMBERS = [
  { to: 4, label: 'sample papers read' },
  { to: 72, label: 'questions sorted into topics' },
  { to: 9, label: 'questions found asked again' },
  { to: 0, label: 'bytes sent to the cloud' },
];

function Numbers() {
  return (
    <section className="border-y border-rule bg-card/60" aria-labelledby="numbers-title">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <h2 id="numbers-title" className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
          From one test run on Computer Networks sample papers
        </h2>
        <dl className="mt-6 grid grid-cols-2 gap-8 md:grid-cols-4">
          {NUMBERS.map((n) => (
            <div key={n.label}>
              <dt className="sr-only">{n.label}</dt>
              <dd className="font-mono text-5xl font-semibold text-ink">
                <CountUp to={n.to} duration={1.4} />
              </dd>
              <dd className="mt-1 text-sm text-ink-muted">{n.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'Make a notebook', text: 'One per subject: "DBMS – Sem 5", "Computer Networks".' },
  { title: 'Feed it', text: 'The syllabus, your class notes, and as many past papers as you can find, each with its year.' },
  { title: 'Revise smart', text: 'Start from the hot topics in the Analyzer, then ask your notes anything you are unsure about.' },
];

function Steps() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-6 py-20" aria-labelledby="how-title">
      <h2 id="how-title" className="text-4xl font-semibold">How it works</h2>
      <ol className="mt-10 grid gap-10 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="relative grid size-11 shrink-0 place-items-center font-mono font-semibold text-pen">
              <svg viewBox="0 0 40 40" className="absolute inset-0" aria-hidden="true">
                <path
                  d="M20 4 C 31 3, 37 11, 36 21 C 35 31, 27 37, 18 36 C 9 35, 3 28, 4 18 C 5 10, 12 5, 23 5"
                  fill="none"
                  stroke="var(--pen)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {i + 1}
            </span>
            <div>
              <h3 className="font-serif text-xl font-semibold">{s.title}</h3>
              <p className="mt-1 text-ink-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FinalCta() {
  const { status } = useAuth();
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20">
      <div className="ruled ruled-margin card-surface px-6 py-14 pl-16 sm:pl-24">
        <h2 className="max-w-2xl text-3xl leading-tight font-medium sm:text-4xl">
          Your next paper is already written. <em className="font-normal">Some of it, you have seen before.</em>
        </h2>
        <Link
          to={status === 'authed' ? '/dashboard' : '/register'}
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-paper"
        >
          {status === 'authed' ? 'Open your notebooks' : 'Start a notebook'} <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-ink-muted">
        <Logo to="/" />
        <p>A portfolio project by Sachin Katigar, BCA. Runs locally with Ollama.</p>
      </div>
    </footer>
  );
}
