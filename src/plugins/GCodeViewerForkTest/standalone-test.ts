// Throwaway smoke test - imports the fork exactly the way a real DWC module would (a genuine
// source-level import Vite's dev server transforms/resolves), but runs standalone without
// needing a registered route or an active machine connection.
export async function runSmokeTest(): Promise<string[]> {
	const lines: string[] = [];
	const log = (l: string) => lines.push(l);

	try {
		log("importing @duet3d/gcodeviewer ...");
		const mod = await import("@duet3d/gcodeviewer");
		log(`import OK, exports: ${Object.keys(mod).join(", ")}`);

		const canvas = document.createElement("canvas");
		canvas.width = 600;
		canvas.height = 400;
		document.body.appendChild(canvas);

		const viewer = new mod.Viewer_Proxy(canvas);
		log("Viewer_Proxy constructed");

		const events: string[] = [];
		viewer.passThru = (e: any) => {
			events.push(e.type);
			log(`event: ${JSON.stringify(e).slice(0, 300)}`);
		};

		viewer.init();
		log("init() called");

		try {
			await viewer.enableWasmProcessing();
			log("WASM ENABLED (fast path active)");
		} catch (err: any) {
			log(`WASM not enabled (expected fallback if no Rust toolchain built it): ${err?.message ?? err}`);
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

		log("loading test file via Promise-based loadFile() ...");
		const loadResult = await viewer.loadFile(testGcode);
		log(`loadFile() resolved: ${JSON.stringify(loadResult)}`);
		log(`  maxHeight/minHeight should be non-zero (test file has a Z0.2 move) - was always 0/0 before this fix`);
		const stats = await viewer.getProcessingStats();
		log(`processing stats: ${JSON.stringify(stats)}`);

		log("calling reload() ...");
		const reloadResult = await viewer.reload();
		log(`reload() resolved: ${JSON.stringify(reloadResult)}`);

		log("calling clear() ...");
		await viewer.clear();
		log("clear() resolved");

		log("loading again after clear, to confirm the pipe still works ...");
		const secondLoad = await viewer.loadFile(testGcode);
		log(`second loadFile() resolved: ${JSON.stringify(secondLoad)}`);

		log("calling frameToContent(false) - should not throw ...");
		viewer.frameToContent(false);
		await new Promise((r) => setTimeout(r, 500));
		log("frameToContent(false) call completed without an unhandled error surfacing");

		log("calling frameToContent(true) - should not throw ...");
		viewer.frameToContent(true);
		await new Promise((r) => setTimeout(r, 500));
		log("frameToContent(true) call completed without an unhandled error surfacing");

		log("loading a deliberately empty/garbage file to check the failed-load path ...");
		const emptyLoad = await viewer.loadFile("");
		log(`empty-file loadFile() resolved: ${JSON.stringify(emptyLoad)}`);

		// Phase 5b-5g smoke tests - each should complete without an unhandled error surfacing
		log("re-loading test file before exercising the new Phase 5 APIs ...");
		const reloaded = await viewer.loadFile(testGcode);
		log(`loadFile() resolved: ${JSON.stringify(reloaded)}`);

		log("calling setNozzlePosition({x:5,y:5,z:1}) ...");
		viewer.setNozzlePosition({ x: 5, y: 5, z: 1 });
		log("setNozzlePosition() call completed without an unhandled error surfacing");

		log("calling setWorkplaceOffsets(...) + setCurrentWorkplaceIndex(1) + showWorkplace(true) ...");
		viewer.setWorkplaceOffsets([
			{ x: 0, y: 0, z: 0 },
			{ x: 10, y: 20, z: 0 },
		]);
		viewer.setCurrentWorkplaceIndex(1);
		viewer.showWorkplace(true);
		log("workplace gizmo calls completed without an unhandled error surfacing");

		log("calling setShowTravels(false) then setPersistTravels(true) ...");
		viewer.setShowTravels(false);
		viewer.setPersistTravels(true);
		viewer.setShowTravels(true);
		log("travel-display calls completed without an unhandled error surfacing");

		log("calling setFeedColors('#00ff00', '#ff00ff') + setFeedRateRange(100, 2000) ...");
		viewer.setFeedColors("#00ff00", "#ff00ff");
		viewer.setFeedRateRange(100, 2000);
		log("feed-rate legend calls completed without an unhandled error surfacing");

		log("starting a load and cancelling it immediately to check cancelLoad() ...");
		const loadPromise = viewer.loadFile(testGcode);
		viewer.cancelLoad();
		const cancelledResult = await loadPromise;
		log(`cancelLoad() path resolved: ${JSON.stringify(cancelledResult)}`);
		log(`  expected cancelled:true, failed:false - a user-initiated cancel is not an error`);

		log("loading once more after a cancellation, to confirm the pipe still works afterwards ...");
		const afterCancelLoad = await viewer.loadFile(testGcode);
		log(`loadFile() after cancellation resolved: ${JSON.stringify(afterCancelLoad)}`);

		log("building a 200,000-line file to force a real mid-parse cancellation (past the 10k-line chunk yield point) ...");
		const bigLines = ["; big file"];
		for (let i = 0; i < 200000; i++) {
			bigLines.push(`G1 X${i % 200} Y${(i * 2) % 200} Z${(i * 0.001).toFixed(3)} E${i} F1200`);
		}
		const bigFile = bigLines.join("\n");
		const bigLoadPromise = viewer.loadFile(bigFile);
		setTimeout(() => viewer.cancelLoad(), 5);
		const bigCancelledResult = await bigLoadPromise;
		log(`large-file cancelLoad() resolved: ${JSON.stringify(bigCancelledResult)}`);
		log(`  expected cancelled:true here - the 8-line file earlier never yields, so cancelLoad() had no chance to take effect`);

		log("loading the small test file once more after the large-file cancellation ...");
		const afterBigCancelLoad = await viewer.loadFile(testGcode);
		log(`loadFile() after large-file cancellation resolved: ${JSON.stringify(afterBigCancelLoad)}`);

		log("loading a Prusa-header file with feature comments through the WASM path (P0-3 slicer rewrite check) ...");
		const prusaGcode = [
			"; generated by PrusaSlicer 2.6.0+win64 on 2023-09-01 at 12:30:45 UTC",
			"G28",
			"G90",
			";TYPE:PERIMETER",
			"G1 X10 Y10 Z0.2 E1 F1800",
			";TYPE:EXTERNAL PERIMETER",
			"G1 X20 Y10 E2 F1800",
			";TYPE:TOP SOLID INFILL",
			"G1 X20 Y20 E3 F1800",
			";TYPE:SUPPORT MATERIAL",
			"G1 X10 Y20 E4 F1800",
			";TYPE:SOME_UNKNOWN_FEATURE",
			"G1 X10 Y10 E5 F1800",
		].join("\n");
		const prusaResult = await viewer.loadFile(prusaGcode);
		log(`Prusa feature-comment file resolved: ${JSON.stringify(prusaResult)}`);

		viewer.unload();
		log("unload() called");
	} catch (err: any) {
		log(`FAIL: ${err?.stack || err}`);
	}

	return lines;
}

(window as any).__runGcodeViewerForkSmokeTest = runSmokeTest;
