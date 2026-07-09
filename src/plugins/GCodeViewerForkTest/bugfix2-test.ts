// Throwaway verification for the second bug-fix round: nozzle animation speed clamp,
// refreshMaterialState()'s missing addOnce fallback (Force Line Rendering corruption), and
// transparency/ghosting only being visible while scrubbed to a partial position.
export async function runSpeedTest(): Promise<{ speed10Ms: number; speed100Ms: number }> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 200;
	canvas.height = 200;
	document.body.appendChild(canvas);
	const viewer = new mod.Viewer_Proxy(canvas);
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	// A handful of long, slow extruding moves so realDurationMs is large enough that the
	// 50ms-per-move floor doesn't swallow the speed difference, and enough of them that
	// sortedPositions has real steps to animate through
	const gcode = ["G28", "G90"];
	let ee = 0;
	for (let i = 0; i < 20; i++) {
		const x = (i % 2 === 0) ? 200 : 0;
		ee += 50;
		gcode.push(`G1 X${x} Y${i * 10} Z5 E${ee} F300`);
	}
	await viewer.loadFile(gcode.join("\n"));
	const stats = await viewer.getProcessingStats();
	console.log('[bugfix2] stats after load:', JSON.stringify(stats));

	async function timeAnimation(speed: number): Promise<number> {
		viewer.setNozzleAnimationSpeed(speed);
		viewer.updateFilePosition(0);
		await new Promise((r) => setTimeout(r, 100));
		const start = performance.now();
		let resolveStop: () => void;
		const stopped = new Promise<void>((res) => { resolveStop = res; });
		const prevPassThru = viewer.passThru;
		viewer.passThru = (e: any) => {
			if (e.type === "animationStopped") resolveStop();
			prevPassThru?.(e);
		};
		viewer.startNozzleAnimation();
		await stopped;
		return performance.now() - start;
	}

	const speed10Ms = await timeAnimation(10);
	const speed100Ms = await timeAnimation(100);

	viewer.unload();
	canvas.remove();
	return { speed10Ms, speed100Ms };
}

export async function runVisualTest(): Promise<void> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 900;
	canvas.height = 700;
	canvas.id = "bugfix2-canvas";
	document.body.innerHTML = "";
	document.body.appendChild(canvas);

	const viewer = new mod.Viewer_Proxy(canvas);
	(window as any).__viewer2 = viewer;
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	// A larger multi-layer octagon so mesh building spans several chunks (breakPoint = 100000
	// segments) - repeat the loop many times to push past that boundary and exercise multiple
	// LineShaderMaterial instances, some of which may still be mid-shader-compile when toggled
	const lines = ["G28", "G90"];
	const cx = 50, cy = 50, r = 15;
	const pts: [number, number][] = [];
	for (let i = 0; i <= 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	let e = 0;
	for (let layer = 0; layer < 700; layer++) {
		const z = (0.2 + layer * 0.02).toFixed(3);
		lines.push(`G1 Z${z} F600`);
		lines.push(`G1 X${pts[0][0].toFixed(3)} Y${pts[0][1].toFixed(3)} F3000`);
		for (let i = 1; i < pts.length; i++) {
			e += 1.2;
			lines.push(`G1 X${pts[i][0].toFixed(3)} Y${pts[i][1].toFixed(3)} E${e.toFixed(3)} F1500`);
		}
	}
	const gcode = lines.join("\n");

	viewer.setMeshMode(0);
	const result = await viewer.loadFile(gcode);
	(window as any).__bugfix2Result = result;
	viewer.frameToContent(false);
	await new Promise((r) => setTimeout(r, 500));
}

(window as any).__runBugfix2Speed = runSpeedTest;
(window as any).__runBugfix2Visual = runVisualTest;
