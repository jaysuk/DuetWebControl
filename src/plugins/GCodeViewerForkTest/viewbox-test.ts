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

	const lines = ["G28", "G90"];
	let e = 0;
	for (let layer = 0; layer < 40; layer++) {
		const z = (0.2 + layer * 0.2).toFixed(2);
		lines.push(`G1 Z${z} F600`);
		lines.push(`G1 X10 Y10 F3000`);
		e += 1;
		lines.push(`G1 X30 Y10 E${e} F1200`);
		e += 1;
		lines.push(`G1 X30 Y30 E${e}`);
		e += 1;
		lines.push(`G1 X10 Y30 E${e}`);
		e += 1;
		lines.push(`G1 X10 Y10 E${e}`);
	}
	const gcode = lines.join("\n");
	await viewer.loadFile(gcode);
	viewer.frameToContent(false);
	await new Promise((r) => setTimeout(r, 500));
}

(window as any).__runViewboxTest = runViewboxTest;
