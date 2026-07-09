// Fresh recheck of the gizmo-click and nozzle-speed fixes with a real typical (short-segment) file
export async function runSpeedRecheck(): Promise<{ speed1Ms: number; speed10Ms: number; speed100Ms: number; moveCount: number }> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 200;
	canvas.height = 200;
	document.body.appendChild(canvas);
	const viewer = new mod.Viewer_Proxy(canvas);
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	// Typical short-segment print moves (small distances, normal feedrate) - the shape that
	// actually dominates real G-code, unlike the earlier long-slow-move test
	const lines = ["G28", "G90"];
	let e = 0;
	for (let i = 0; i < 60; i++) {
		const x = 50 + (i % 2 === 0 ? 20 : 0);
		const y = 50 + Math.floor(i / 2) * 0.4;
		e += 0.5;
		lines.push(`G1 X${x} Y${y.toFixed(2)} Z0.2 E${e.toFixed(2)} F1500`);
	}
	const gcode = lines.join("\n");
	await viewer.loadFile(gcode);
	viewer.toggleNozzle(true); // visible, so the tween-based (not instant) path is exercised

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

	const speed1Ms = await timeAnimation(1);
	const speed10Ms = await timeAnimation(10);
	const speed100Ms = await timeAnimation(100);

	viewer.unload();
	canvas.remove();
	return { speed1Ms, speed10Ms, speed100Ms, moveCount: 60 };
}

(window as any).__runSpeedRecheck = runSpeedRecheck;
