// Throwaway verification for the orientation-gizmo click bug
export async function runViewboxTest(): Promise<void> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 900;
	canvas.height = 700;
	canvas.id = "viewbox-test-canvas";
	document.body.innerHTML = "";
	document.body.appendChild(canvas);

	const viewer = new mod.Viewer_Proxy(canvas);
	(window as any).__viewerVB = viewer;
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	const gcode = [
		"G28", "G90",
		"G1 X10 Y10 Z0.2 F1500",
		"G1 X30 Y10 E1 F1200",
		"G1 X30 Y30 E2",
		"G1 X10 Y30 E3",
		"G1 X10 Y10 E4",
	].join("\n");
	await viewer.loadFile(gcode);
	viewer.frameToContent(false);
	await new Promise((r) => setTimeout(r, 500));
}

(window as any).__runViewboxTest = runViewboxTest;
