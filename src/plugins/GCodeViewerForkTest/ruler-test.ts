// Throwaway verification for the new ruler tick labels
export async function runRulerTest(): Promise<void> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 900;
	canvas.height = 700;
	canvas.id = "ruler-test-canvas";
	document.body.innerHTML = "";
	document.body.appendChild(canvas);

	const viewer = new mod.Viewer_Proxy(canvas);
	(window as any).__viewerRuler = viewer;
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});
	viewer.setBuildVolume({ x: { min: 0, max: 220 }, y: { min: 0, max: 220 }, z: { min: 0, max: 250 } });

	const gcode = ["G28", "G90", "G1 X50 Y50 Z0.2 F1500", "G1 X150 Y50 E5 F1200", "G1 X150 Y150 E10", "G1 X50 Y150 E15", "G1 X50 Y50 E20"].join("\n");
	await viewer.loadFile(gcode);
	viewer.frameToContent(false);
	await new Promise((r) => setTimeout(r, 500));
}

(window as any).__runRulerTest = runRulerTest;
