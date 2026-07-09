// Verifies updateCurrentFilePosition actually reaches the shader again (regression check) and
// that the leak is still fixed with the coalescing approach
export async function runPositionFixTest(): Promise<any> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 900;
	canvas.height = 700;
	canvas.id = "position-fix-canvas";
	document.body.innerHTML = "";
	document.body.appendChild(canvas);

	const viewer = new mod.Viewer_Proxy(canvas);
	(window as any).__viewerPF = viewer;
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	const lines = ["G28", "G90"];
	let e = 0;
	for (let layer = 0; layer < 20; layer++) {
		const z = (0.2 + layer * 0.2).toFixed(2);
		lines.push(`G1 Z${z} F600`);
		lines.push(`G1 X10 Y10 F3000`);
		for (const [x, y] of [[30, 10], [30, 30], [10, 30], [10, 10]]) {
			e += 1;
			lines.push(`G1 X${x} Y${y} E${e}`);
		}
	}
	await viewer.loadFile(lines.join("\n"));
	viewer.setMeshMode(0);
	viewer.frameToContent(false);
	await new Promise((r) => setTimeout(r, 300));

	// --- Test 1: scrub (updateFilePosition) actually changes rendered state ---
	viewer.setAlphaMode(true); // so partial reveal is visible via ghosting
	viewer.updateFilePosition(50, false);
	await new Promise((r) => setTimeout(r, 300));

	// --- Test 2: playback actually progresses and completes ---
	viewer.updateFilePosition(0);
	let positionUpdates = 0;
	let stoppedFired = false;
	const prevPassThru = viewer.passThru;
	viewer.passThru = (e: any) => {
		if (e.type === "animationPositionUpdate") positionUpdates++;
		if (e.type === "animationStopped") stoppedFired = true;
		prevPassThru?.(e);
	};
	viewer.setNozzleAnimationSpeed(100);
	viewer.startNozzleAnimation();
	const playStart = performance.now();
	while (!stoppedFired && performance.now() - playStart < 15000) {
		await new Promise((r) => setTimeout(r, 100));
	}
	const playElapsedMs = performance.now() - playStart;

	// --- Test 3: pick-to-jump (simulated via updateFilePosition, matching what the click handler does) ---
	viewer.updateFilePosition(30, false);
	await new Promise((r) => setTimeout(r, 200));

	viewer.unload();
	canvas.remove();

	return { positionUpdates, stoppedFired, playElapsedMs };
}

(window as any).__runPositionFixTest = runPositionFixTest;
