import { motion } from 'framer-motion';

// A hand-drawn red-pen stroke under a word, drawn in once when it appears.
export default function RedPenUnderline({ children }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        className="pointer-events-none absolute -bottom-2 left-0 h-3 w-full overflow-visible"
        viewBox="0 0 200 12"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <motion.path
          d="M2 8 C 40 3, 80 4, 120 6 S 180 9, 198 4"
          fill="none"
          stroke="var(--pen)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
        />
      </svg>
    </span>
  );
}
