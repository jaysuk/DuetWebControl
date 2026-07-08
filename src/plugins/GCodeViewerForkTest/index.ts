import { registerRoute } from "@/plugins";

import GCodeViewerForkTest from "./GCodeViewerForkTest.vue";

registerRoute(GCodeViewerForkTest, {
	Plugins: {
		GCodeViewerForkTest: {
			icon: "mdi-flask",
			caption: "GCode Viewer Fork Smoke Test",
			translated: true,
			path: "/Plugins/GCodeViewerForkTest",
		},
	},
});
