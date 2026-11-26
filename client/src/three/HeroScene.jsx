import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, DoubleSide, FrontSide, MathUtils, PlaneGeometry } from 'three';
import { COLORS, PAPERS, SHEET_H, SHEET_W, makeHeatmapCard, makeSheet } from './sheetTextures.js';

// The landing page's 3D story. `progress` is a framer-motion MotionValue (0 → 1) driven by scroll.
// Loaded lazily (its own JS chunk), rendered only when WebGL works and the user doesn't prefer reduced motion,
// and paused (frameloop "never") while scrolled off-screen.
export default function HeroScene({ progress, active }) {
  return (
    <Canvas
      flat // no tone mapping: unlit paper keeps its real colours
      dpr={[1, 1.5]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, 7], fov: 35 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-hidden="true"
    >
      <Story progress={progress} />
    </Canvas>
  );
}

const FONTS = ['600 40px "Fraunces Variable"', '400 23px "DM Sans Variable"', '500 20px "JetBrains Mono Variable"'];

// smoothstep: 0 before a, 1 after b, eased in between
const ss = (a, b, x) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Unit plane whose left edge is at x = 0, so scaling x "draws" it left to right like a highlighter.
const strokeGeometry = new PlaneGeometry(1, 1).translate(0.5, 0, 0);
const cellGeometry = new PlaneGeometry(1, 1);
const sheetGeometry = new PlaneGeometry(SHEET_W, SHEET_H);

// Where each sheet sits in the stack, and where it goes when the pile fans out.
const STACK = PAPERS.map((_, i) => ({
  x: i * 0.05,
  y: -i * 0.04,
  z: -i * 0.06,
  rot: [0.0, 0.05, -0.04, 0.07][i],
  fanX: [-1.6, -0.55, 0.55, 1.6][i],
  fanRot: [0.16, 0.05, -0.06, -0.17][i],
}));

function cellColor(count) {
  const mix = count >= 3 ? 1 : count === 2 ? 0.75 : 0.45;
  return new Color(COLORS.PAPER).lerp(new Color(COLORS.HIGHLIGHT), mix);
}

function Story({ progress }) {
  const [assets, setAssets] = useState(null);

  // Canvas text needs the web fonts loaded first, or the sheets would be drawn in a fallback font.
  useEffect(() => {
    let cancelled = false;
    Promise.all(FONTS.map((f) => document.fonts.load(f)))
      .catch(() => {})
      .then(() => {
        if (!cancelled) setAssets({ sheets: PAPERS.map(makeSheet), heat: makeHeatmapCard() });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      assets?.sheets.forEach((s) => s.texture.dispose());
      assets?.heat.texture.dispose();
    },
    [assets],
  );

  return assets ? <Pile assets={assets} progress={progress} /> : null;
}

function Pile({ assets, progress }) {
  const { viewport } = useThree();
  const group = useRef();
  const sheets = useRef([]);
  const strokes = useRef([]);
  const heatCard = useRef();
  const cells = useRef([]);
  const smoothed = useRef(progress.get());
  const cellColors = useMemo(() => assets.heat.cells.map((c) => cellColor(c.count)), [assets]);

  useFrame((state, delta) => {
    // Ease toward the scroll position so fast scrolling still looks calm.
    smoothed.current = MathUtils.damp(smoothed.current, progress.get(), 6, delta);
    const p = smoothed.current;
    const t = state.clock.elapsedTime;

    const fan = ss(0.06, 0.3, p);
    const forward = ss(0.32, 0.48, p);
    const sweep = ss(0.5, 0.7, p);
    const flip = ss(0.72, 0.84, p);
    const fill = ss(0.82, 0.97, p);

    // Fit the fanned-out pile into the canvas, and lean a little toward the pointer.
    const fit = MathUtils.clamp(viewport.width / 6.6, 0.45, 1);
    group.current.scale.setScalar(fit);
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, state.pointer.x * 0.12, 3, delta);
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, -state.pointer.y * 0.08, 3, delta);

    sheets.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = STACK[i];
      const breathe = Math.sin(t * 0.9 + i * 0.8) * 0.035 * (1 - forward);
      let x = s.x + s.fanX * fan;
      let y = s.y + breathe - Math.abs(s.fanX) * 0.12 * fan;
      let z = s.z;
      let rot = s.rot + s.fanRot * fan;
      let opacity = 1;

      if (i === 0) {
        // The 2025 paper comes to the front, then flips over into the heatmap.
        x = MathUtils.lerp(x, 0, forward);
        y = MathUtils.lerp(y, 0, forward);
        z = MathUtils.lerp(z, 1.3, forward);
        rot = MathUtils.lerp(rot, 0, forward);
        mesh.rotation.y = Math.PI * flip;
      } else {
        z -= 0.7 * forward;
        y -= 0.35 * forward;
        opacity = (1 - 0.7 * forward) * (1 - flip);
      }
      mesh.position.set(x, y, z);
      mesh.rotation.z = rot;
      mesh.material.opacity = opacity;
      mesh.visible = opacity > 0.01;
    });

    // Highlighter strokes, one after another.
    const n = strokes.current.length;
    strokes.current.forEach((mesh, k) => {
      if (!mesh) return;
      const local = MathUtils.clamp(sweep * n - k, 0, 1);
      mesh.scale.x = Math.max(0.0001, mesh.userData.width * local);
      mesh.visible = local > 0;
    });

    // Heatmap cells fill in, staggered by column then row.
    cells.current.forEach((mesh, k) => {
      if (!mesh) return;
      const c = assets.heat.cells[k];
      const local = MathUtils.clamp(fill * 1.6 - (c.col * 0.12 + c.row * 0.05), 0, 1);
      mesh.scale.set(c.w * Math.max(0.0001, local), c.h, 1);
      mesh.visible = local > 0;
    });
    heatCard.current.visible = flip > 0.5;
  });

  return (
    <group ref={group}>
      {assets.sheets.map((sheet, i) => (
        <mesh
          key={PAPERS[i].year}
          ref={(m) => (sheets.current[i] = m)}
          geometry={sheetGeometry}
          renderOrder={PAPERS.length - i}
        >
          <meshBasicMaterial map={sheet.texture} transparent side={FrontSide} />
          {i === 0 && (
            <>
              {sheet.strokes.map((s, k) => (
                <mesh
                  key={k}
                  ref={(m) => (strokes.current[k] = m)}
                  geometry={strokeGeometry}
                  position={[s.x, s.y - s.height / 2, 0.004]}
                  renderOrder={20} // after the sheet, which is drawn last of the pile
                  scale={[0.0001, s.height, 1]}
                  userData={{ width: s.width }}
                >
                  <meshBasicMaterial color={COLORS.HIGHLIGHT} transparent opacity={0.55} depthWrite={false} />
                </mesh>
              ))}
              {/* The back of the front sheet is the heatmap card, revealed by the flip. */}
              <mesh
                ref={heatCard}
                geometry={sheetGeometry}
                rotation={[0, Math.PI, 0]}
                position={[0, 0, -0.004]}
                renderOrder={20}
              >
                <meshBasicMaterial map={assets.heat.texture} side={FrontSide} />
                {assets.heat.cells.map((c, k) => (
                  <mesh
                    key={`${c.row}-${c.col}`}
                    ref={(m) => (cells.current[k] = m)}
                    geometry={cellGeometry}
                    position={[c.x, c.y, 0.004]}
                    renderOrder={30}
                  >
                    <meshBasicMaterial color={cellColors[k]} side={DoubleSide} />
                  </mesh>
                ))}
              </mesh>
            </>
          )}
        </mesh>
      ))}
    </group>
  );
}

