// Throwaway Phase 7 check: repeated construct/init/load/unload cycles, watching JS heap size to
// catch a worker/Babylon/WASM instance leak from a missing unload() (the bug found and fixed
// during Phase 3 - this is the regression check for it).
export async function runLeakTest(cycles: number): Promise<{ cycle: number; heapMB: number }[]> {
	const mod = await import("@duet3d/gcodeviewer");
	const samples: { cycle: number; heapMB: number }[] = [];

	const gcode = [
		"G28",
		"G90",
		"G1 X10 Y10 Z0.2 F1500",
		"G1 X20 Y10 E1 F1200",
		"G1 X20 Y20 E2",
		"G1 X10 Y20 E3",
		"G1 X10 Y10 E4",
	].join("\n");

	for (let i = 0; i < cycles; i++) {
		const canvas = document.createElement("canvas");
		canvas.width = 400;
		canvas.height = 300;
		document.body.appendChild(canvas);

		const viewer = new mod.Viewer_Proxy(canvas);
		viewer.init();
		await viewer.enableWasmProcessing().catch(() => {});
		await viewer.loadFile(gcode);
		viewer.unload();
		canvas.remove();

		if ((window as any).gc) {
			(window as any).gc();
		}
		await new Promise((r) => setTimeout(r, 50));

		const heapMB = (performance as any).memory
			? (performance as any).memory.usedJSHeapSize / (1024 * 1024)
			: -1;
		samples.push({ cycle: i, heapMB });
	}

	return samples;
}

(window as any).__runGcodeViewerLeakTest = runLeakTest;
