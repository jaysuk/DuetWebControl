// Throwaway visual check for the new setTransparency/setUseSpecular shader uniforms - imported
// the same real-source way as standalone-test.ts, so it resolves through DWC's own Vite bundle.
export async function runShaderTest(): Promise<void> {
	const mod = await import("@duet3d/gcodeviewer");
	const canvas = document.createElement("canvas");
	canvas.width = 900;
	canvas.height = 700;
	canvas.id = "shader-test-canvas";
	document.body.innerHTML = "";
	document.body.appendChild(canvas);

	const viewer = new mod.Viewer_Proxy(canvas);
	(window as any).__viewer = viewer;
	viewer.init();
	await viewer.enableWasmProcessing().catch(() => {});

	const lines = ["G28", "G90"];
	for (let layer = 0; layer < 6; layer++) {
		const z = (0.2 + layer * 0.2).toFixed(2);
		lines.push(`G1 X10 Y10 Z${z} F1500`);
		lines.push(`G1 X30 Y10 E${layer * 4 + 1} F1200`);
		lines.push(`G1 X30 Y30 E${layer * 4 + 2}`);
		lines.push(`G1 X10 Y30 E${layer * 4 + 3}`);
		lines.push(`G1 X10 Y10 E${layer * 4 + 4}`);
	}
	const gcode = lines.join("\n");

	viewer.setMeshMode(0);
	viewer.setRenderMode(0);
	await viewer.loadFile(gcode);
	viewer.frameToContent(false);
	await new Promise((r) => setTimeout(r, 800));
}

(window as any).__runGcodeViewerShaderTest = runShaderTest;
