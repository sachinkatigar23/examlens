// CountUp — from React Bits (https://reactbits.dev/text-animations/count-up), Copyright (c) 2026 David Haz,
// MIT + Commons Clause, see ./LICENSE.md.
// ExamLens changes: imports from 'framer-motion'; kept only the plain "count" mode (the digit-roll mode, compact
// format and hover replay were removed because the landing page doesn't use them); removed 'use client'.

import { animate, cubicBezier, useInView } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const clamp01 = value => Math.min(1, Math.max(0, value));

const EASINGS = {
  linear: t => t,
  easeOut: cubicBezier(0.33, 1, 0.68, 1),
  expo: t => (t >= 1 ? 1 : (1 - Math.pow(2, -10 * t)) / (1 - Math.pow(2, -10)))
};

const getDecimalPlaces = num => {
  const str = num.toString();

  if (str.includes('.')) {
    const decimals = str.split('.')[1];

    if (parseInt(decimals) !== 0) {
      return decimals.length;
    }
  }

  return 0;
};

const group = (int, separator) => (separator ? int.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : int);

export default function CountUp({
  to,
  from = 0,
  direction = 'up',
  delay = 0,
  duration = 2,
  className = '',
  style,
  startWhen = true,
  separator = '',
  prefix = '',
  suffix = '',
  easing = 'easeOut',
  decimals,
  trigger = 'view',
  onStart,
  onEnd
}) {
  const ref = useRef(null);
  const textRef = useRef(null);
  const startValue = direction === 'down' ? to : from;
  const endValue = direction === 'down' ? from : to;
  const valueRef = useRef(startValue);
  const startedRef = useRef(false);
  const runningRef = useRef(false);
  const [play, setPlay] = useState(null);
  const isInView = useInView(ref, { once: true, margin: '0px' });
  const active = trigger === 'load' || isInView;
  const places = decimals ?? Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

  const formatValue = useCallback(
    latest => {
      const fixed = Math.abs(latest).toFixed(places);
      const [int, frac = ''] = fixed.split('.');
      const negative = latest < 0 && Number(fixed) !== 0;
      return `${prefix}${negative ? '-' : ''}${group(int, separator)}${frac ? `.${frac}` : ''}${suffix}`;
    },
    [places, separator, prefix, suffix]
  );

  const [initialText] = useState(() => formatValue(startValue));
  const latestRef = useRef(null);

  useIsoLayoutEffect(() => {
    latestRef.current = { formatValue, onStart, onEnd, easing, duration: Math.max(0, duration), delay };
  });

  useIsoLayoutEffect(() => {
    if (!startedRef.current) valueRef.current = startValue;
    if (!runningRef.current && textRef.current) {
      textRef.current.textContent = formatValue(valueRef.current);
    }
  }, [startValue, formatValue]);

  useEffect(() => {
    if (!active || !startWhen) return;
    startedRef.current = true;
    setPlay(previous => ({ id: (previous?.id || 0) + 1, from: valueRef.current, to: endValue }));
  }, [active, startWhen, endValue]);

  useEffect(() => {
    if (!play) return undefined;
    const live = latestRef.current;
    const ease = EASINGS[live.easing] || EASINGS.easeOut;
    const total = live.duration;
    const progress = t => (total > 0 ? clamp01(t / total) : 1);

    const render = t => {
      const value = play.from + (play.to - play.from) * ease(progress(t));
      valueRef.current = value;
      if (textRef.current) textRef.current.textContent = latestRef.current.formatValue(value);
    };

    runningRef.current = true;
    if (typeof live.onStart === 'function') live.onStart();

    const finish = () => {
      render(Infinity);
      valueRef.current = play.to;
      runningRef.current = false;
      if (typeof latestRef.current.onEnd === 'function') latestRef.current.onEnd();
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return undefined;
    }

    const controls = animate(0, total, {
      duration: total,
      delay: live.delay,
      ease: 'linear',
      onUpdate: render,
      onComplete: finish
    });

    return () => {
      controls.stop();
      runningRef.current = false;
    };
  }, [play]);

  return (
    <span className={className} ref={ref} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      <span ref={textRef}>{initialText}</span>
    </span>
  );
}
