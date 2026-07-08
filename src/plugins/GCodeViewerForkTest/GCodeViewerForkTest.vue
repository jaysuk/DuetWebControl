<template>
	<div style="padding: 16px;">
		<h2>GCode Viewer Fork - Smoke Test</h2>
		<p>Isolated test of @duet3d/gcodeviewer (the fork) inside a real DWC build. Does not touch the real GCodeViewer plugin.</p>
		<canvas ref="canvasEl" style="width: 600px; height: 400px; display: block; border: 1px solid #666; background: #222;" />
		<pre id="smoke-test-status" style="white-space: pre-wrap; background: #111; color: #0f0; padding: 8px; margin-top: 12px; min-height: 200px;">{{ statusLines.join('\n') }}</pre>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

const canvasEl = ref<HTMLCanvasElement | null>(null);
const statusLines = ref<string[]>(["starting..."]);

function log(line: string) {
	statusLines.value.push(line);
	console.log("[gcodeviewer-fork-smoke-test]", line);
}

const testGcode = [
	"; smoke test file",
	"G28",
	"G90",
	"G1 X10 Y10 Z0.2 F1500",
	"G1 X20 Y10 E1 F1200",
	"G1 X20 Y20 E2",
	"G1 X10 Y20 E3",
	"G1 X10 Y10 E4",
].join("\n");

onMounted(async () => {
	if (!canvasEl.value) {
		log("FAIL: canvas ref missing");
		return;
	}

	try {
		log("importing @duet3d/gcodeviewer ...");
		const mod = await import("@duet3d/gcodeviewer");
		log(`import OK, exports: ${Object.keys(mod).join(", ")}`);

		const viewer = new mod.Viewer_Proxy(canvasEl.value);
		log("Viewer_Proxy constructed");

		viewer.passThru = (e: any) => {
			log(`event: ${JSON.stringify(e).slice(0, 200)}`);
		};

		viewer.init();
		log("init() called");

		log("attempting enableWasmProcessing() ...");
		try {
			await viewer.enableWasmProcessing();
			log("WASM ENABLED (fast path active)");
		} catch (err: any) {
			log(`WASM not enabled (expected fallback): ${err?.message ?? err}`);
		}

		log("loading test file ...");
		viewer.loadFile(testGcode);

		// loadFile is fire-and-forget in the current API - poll for the 'fileloaded' passThru
		// event for a few seconds rather than assuming a fixed delay
		let waited = 0;
		const gotFileLoaded = () => statusLines.value.some((l) => l.includes("'fileloaded'"));
		while (!gotFileLoaded() && waited < 8000) {
			await new Promise((r) => setTimeout(r, 250));
			waited += 250;
		}

		if (gotFileLoaded()) {
			log("SUCCESS: fileloaded event received, geometry should be visible above");
		} else {
			log(`TIMEOUT after ${waited}ms waiting for fileloaded event - check the canvas and console for errors`);
		}
	} catch (err: any) {
		log(`FAIL: ${err?.stack ?? err}`);
	}
});
</script>
