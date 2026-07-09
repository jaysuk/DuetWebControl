// Verifies move-batching above 10x actually improves throughput on a realistic multi-thousand-move file
export async function runBatchSpeedTest(moveCount: number): Promise<Record<string, number>> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 200;
	canvas.height = 200;
	document.body.appendChild(canvas);
	const viewer = new mod.Viewer_Proxy(canvas);
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	// Short, typical single-print-line segments (~0.4mm) at a normal feedrate, so each move's real
	// duration falls near/below the 50ms floor - representative of what dominates a real file
	const lines = ["G28", "G90"];
	let e = 0;
	let x = 50;
	for (let i = 0; i < moveCount; i++) {
		x += (i % 2 === 0 ? 0.4 : -0.4);
		e += 0.02;
		lines.push(`G1 X${x.toFixed(2)} Y50 Z0.2 E${e.toFixed(2)} F1500`);
	}
	await viewer.loadFile(lines.join("\n"));
	viewer.toggleNozzle(true);

	async function timeAnimation(speed: number): Promise<number> {
		viewer.setNozzleAnimationSpeed(speed);
		viewer.updateFilePosition(0);
		await new Promise((r) => setTimeout(r, 100));
		const start = performance.now();
		const stopped = new Promise<void>((res) => {
			const prevPassThru = viewer.passThru;
			viewer.passThru = (e: any) => {
				if (e.type === "animationStopped") res();
				prevPassThru?.(e);
			};
		});
		viewer.startNozzleAnimation();
		await stopped;
		return performance.now() - start;
	}

	// Skip 1x here - at a 50ms-per-move floor, 3000 unbatched moves would take ~150s just for
	// that one baseline. 10x is the last unbatched speed and 100x is well into batching, so
	// comparing those two directly demonstrates batching's effect on a large file.
	const speed10Ms = await timeAnimation(10);
	const speed100Ms = await timeAnimation(100);

	viewer.unload();
	canvas.remove();
	return { moveCount, speed10Ms, speed100Ms, ratio10to100: speed10Ms / speed100Ms };
}

(window as any).__runBatchSpeedTest = runBatchSpeedTest;
