import { AnimatePresence, motion } from 'framer-motion';

// Error note in red pen, like a teacher's margin comment. role="alert" so screen readers announce it.
export default function FormError({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden border-l-2 border-pen pl-3 text-sm text-pen"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
