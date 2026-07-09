// Verifies the updateCurrentFilePosition leak fix: runs a long simulation and samples JS heap
// size over time. Before the fix, every step queues an un-consumable onBindObservable.addOnce on
// the 2 (of 3) box/cyl/line materials per chunk that aren't the currently active mesh-mode
// variant, so heap should grow roughly linearly with elapsed time/step count. After the fix, it
// should plateau once GC catches up with everything else.
export async function runLeakSimTest(durationMs: number): Promise<{ t: number; heapMB: number }[]> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 300;
	canvas.height = 300;
	document.body.appendChild(canvas);
	const viewer = new mod.Viewer_Proxy(canvas);
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	// Many short moves so a long simulation actually runs through many steps
	const lines = ["G28", "G90"];
	let e = 0;
	for (let i = 0; i < 3000; i++) {
		const x = 50 + (i % 2 === 0 ? 20 : 0);
		const y = 50 + (i % 100) * 0.4;
		e += 0.5;
		lines.push(`G1 X${x} Y${y.toFixed(2)} Z0.2 E${e.toFixed(2)} F1500`);
	}
	await viewer.loadFile(lines.join("\n"));

	viewer.setNozzleAnimationSpeed(100);
	viewer.updateFilePosition(0);
	viewer.startNozzleAnimation();

	let stopped = false;
	const prevPassThru = viewer.passThru;
	viewer.passThru = (e: any) => {
		if (e.type === "animationStopped") stopped = true;
		prevPassThru?.(e);
	};

	const samples: { t: number; heapMB: number }[] = [];
	const start = performance.now();
	while (performance.now() - start < durationMs) {
		await new Promise((r) => setTimeout(r, 1000));
		if (stopped) {
			// loop the simulation to keep it running for the whole test duration
			stopped = false;
			viewer.updateFilePosition(0);
			viewer.startNozzleAnimation();
		}
		if ((window as any).gc) {
			(window as any).gc();
		}
		const heapMB = (performance as any).memory
			? (performance as any).memory.usedJSHeapSize / (1024 * 1024)
			: -1;
		samples.push({ t: Math.round(performance.now() - start), heapMB });
	}

	viewer.unload();
	canvas.remove();
	return samples;
}

(window as any).__runLeakSimTest = runLeakSimTest;
