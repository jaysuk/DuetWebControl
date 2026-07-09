<style scoped>
.babylon-canvas {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: black;
}

.babylon-canvas-codeview {
	position: absolute;
	top: 0;
	left: 0;
	width: 70%;
	height: 100%;
	background-color: black;
}

.codeview {
	position: absolute;
	top: 0;
	left: 70%;
	width: 30%;
	height: 100%;
}

.codeview-sm {
	position: absolute;
	top: 0;
	left: 70%;
	width: 30%;
	height: 90%;
}

.btn-toggle { flex-direction: column; }

.primary-container {
	position: relative;
	width: 100%;
	height: 100%;
	border-radius: 8px;
	overflow: hidden;
	margin: 8px;
	width: calc(100% - 16px);
}

.gcv-drawer-actions {
	padding: 12px;
}
.gcv-drawer-switches {
	padding: 0 12px 12px;
}
@media (min-width: 840px) {
	.primary-container {
		margin: 0;
		width: 100%;
	}
}

.viewer-box {
	position: absolute;
	inset: 0;
}

.full-screen {
	position: fixed;
	inset: 0;
	/* Vuetify v-app-bar sits at z-index 1008; the fullscreen viewer needs to cover it (the user
	   asked for the full screen, not "everything below the app bar") so go above that layer */
	z-index: 1100;
	background-color: black;
}

.full-screen-icon {
	height: 40px;
	width: 40px;
}

/* Settings slide-in panel + backdrop, scoped to `.viewer-box`. Above the canvas + scrubber +
   loading bar (z-indexes <=19) but below Vuetify dialogs/overlays (1006+) so a v-dialog opened
   from inside the panel still renders on top */
.gcv-settings-backdrop {
	position: absolute;
	inset: 0;
	background-color: rgba(0, 0, 0, 0.4);
	z-index: 30;
	/* Purely a visual dim behind the slide-in panel now - must not catch clicks, or every 3D-view
	   interaction (orientation gizmo, orbit-drag, pick-focus) silently dies while the panel is open */
	pointer-events: none;
}

.gcv-settings-panel {
	position: absolute;
	top: 0;
	left: 0;
	bottom: 0;
	width: 350px;
	max-width: 100%;
	background-color: rgb(var(--v-theme-surface));
	color: rgb(var(--v-theme-on-surface));
	z-index: 31;
	overflow-y: auto;
	box-shadow: 0 0 12px rgba(0, 0, 0, 0.3);
}

.gcv-settings-slide-enter-active,
.gcv-settings-slide-leave-active {
	transition: transform 0.25s ease;
}

.gcv-settings-slide-enter-from,
.gcv-settings-slide-leave-to {
	transform: translateX(-100%);
}

.button-container {
	position: absolute;
	top: 5px;
	left: 5px;
	transition-duration: 0.3s;
}

.button-container-drawer {
	left: 355px !important;
}

/* z-index kept well below Vuetify 4's overlay stack (which starts around 1006 for menus +
   dialogs) so a popover/dialog opened over the viewer renders above the emergency button.
   Pinned to the bottom-right corner so it never sits on top of Babylon's orientation gizmo at
   the top-right of the viewport */
.emergency-button-placement {
	position: absolute;
	bottom: 14px;
	right: 16px;
	z-index: 5;
}

.emergency-button-placement-codeview {
	position: absolute;
	bottom: 14px;
	right: 30%;
	z-index: 5;
}

.loading-progress {
	position: absolute;
	width: 50%;
	left: 0;
	margin-left: 25%;
	top: 5px;
	z-index: 19;
}

.scrubber {
	position: absolute;
	left: 5%;
	right: 5%;
	bottom: 15px;
	z-index: 19;
}

.scrubber-codeview {
	position: absolute;
	left: 5%;
	right: 35%;
	bottom: 15px;
	z-index: 19;
}

.scrubber-sm {
	position: absolute;
	left: 5%;
	right: 5%;
	bottom: 70px;
	z-index: 19;
}

.scrubber-sm-codeview {
	position: absolute;
	left: 5%;
	right: 35%;
	bottom: 70px;
	z-index: 19;
}

.disable-transition {
	transition: none !important;
}

.fsoverlay {
	position: absolute;
	pointer-events: none;
	background-color: transparent;
}
</style>

<template>
	<div ref="primaryContainer" class="primary-container">
		<!-- Teleport to body while fullscreen so the fixed overlay escapes any ancestor stacking
			 context / clipping (e.g. when embedded as a panel tab); inert on the standalone page -->
		<Teleport to="body" :disabled="!fullscreen">
		<div :class="{ 'full-screen': fullscreen }" class="viewer-box">
			<div v-if="fullscreen && settingsStore.showEmergencyStop" :class="emergencyButtonClass">
				<CodeButton :code="'M112\nM999'" :log="false" :title="$t('button.emergencyStop.title')"
							color="error" size="small">
					<v-icon>mdi-flash</v-icon>
				</CodeButton>
			</div>

			<CodeStream :shown="viewGCode" :is-simulating="scrubPlaying" :document="fileData"
						:class="codeViewClass" :currentline="scrubPosition" @changed="scrubPositionChanged" />

			<canvas ref="viewerCanvas" :title="hoverLabel" :class="viewerClass" />

			<FSOverlay v-show="fullscreen && showOverlay" :class="[viewerClass, 'fsoverlay']"
					   :viewgcode="viewGCode" />

			<div class="loading-progress">
				<v-progress-linear v-show="loading" :model-value="loadingProgress" class="disable-transition"
								   height="15" rounded>
					{{ loadingProgress }}% {{ loadingMessage }}
				</v-progress-linear>
			</div>

			<div :class="{ 'button-container-drawer': drawer }" class="button-container">
				<v-btn :title="$t('plugins.gcodeViewer.fullscreen')" class="full-screen-icon mb-2"
					   color="primary" size="small" @click="toggleFullScreen">
					<v-icon>{{ fullscreen ? "mdi-window-restore" : "mdi-window-maximize" }}</v-icon>
				</v-btn>
				<br />
				<v-btn :title="$t('plugins.gcodeViewer.showConfiguration')" class="mb-10"
					   color="primary" size="small" @click="drawer = !drawer">
					<v-icon>mdi-cog</v-icon>
				</v-btn>
				<br />
				<v-btn v-if="isJobRunning && !loading && !followingJob"
					   :title="$t('plugins.gcodeViewer.loadCurrentJob.title')" class="mb-10"
					   color="primary" size="small" @click="() => loadRunningJob(true)">
					<v-icon>mdi-printer-3d</v-icon>
				</v-btn>
				<br />
				<v-btn v-if="loading" :title="$t('plugins.gcodeViewer.cancelLoad')"
					   color="warning" size="small" @click="cancelLoad">
					<v-icon color="error">mdi-cancel</v-icon>
				</v-btn>
			</div>

			<!-- Settings panel: plain absolutely-positioned child of `.viewer-box` rather than a
				 v-navigation-drawer, because the drawer's teleport + overlay layer fights the
				 in-component containment we need. Normal mode: viewer-box is
				 `position: absolute; inset: 0` so the panel stays within the viewer card and
				 doesn't bleed over the status panel above. Fullscreen mode: viewer-box becomes
				 `position: fixed; inset: 0` and the panel covers the viewport with it -->
			<!-- No click-to-close: this used to catch clicks anywhere outside the 350px panel to
				 close it, but that meant it silently intercepted every click meant for the 3D
				 view underneath (the orientation gizmo, orbit-drag, pick-focus) any time the
				 panel was open - the gear icon already toggles the panel unambiguously -->
			<div v-if="drawer" class="gcv-settings-backdrop" />
			<Transition name="gcv-settings-slide">
				<aside v-if="drawer" class="gcv-settings-panel">
					<v-expansion-panels v-model="openDrawerPanel" variant="accordion">
					<v-expansion-panel value="view">
						<v-expansion-panel-title :title="$t('plugins.gcodeViewer.viewActions.title')">
							<v-icon class="mr-2">mdi-eye</v-icon>
							<strong>{{ $t("plugins.gcodeViewer.viewActions.caption") }}</strong>
						</v-expansion-panel-title>
						<v-expansion-panel-text eager>
							<div class="d-flex flex-column ga-2">
								<v-btn :title="$t('plugins.gcodeViewer.resetCamera.title')" block color="primary"
									   prepend-icon="mdi-camera" @click="reset">
									{{ $t("plugins.gcodeViewer.resetCamera.caption") }}
								</v-btn>
								<v-btn :disabled="loading" :title="$t('plugins.gcodeViewer.reloadView.title')" block
									   color="primary" prepend-icon="mdi-reload-alert" @click="reloadviewer">
									{{ $t("plugins.gcodeViewer.reloadView.caption") }}
								</v-btn>
								<v-btn :disabled="!isJobRunning || loading || followingJob"
									   :title="$t('plugins.gcodeViewer.loadCurrentJob.title')" block
									   color="secondary" prepend-icon="mdi-printer-3d" @click="() => loadRunningJob(true)">
									{{ $t("plugins.gcodeViewer.loadCurrentJob.caption") }}
								</v-btn>
								<v-btn :disabled="loading" :title="$t('plugins.gcodeViewer.unloadGCode.title')" block
									   color="primary" prepend-icon="mdi-video-3d-off" @click="clearScene">
									{{ $t("plugins.gcodeViewer.unloadGCode.caption") }}
								</v-btn>
								<v-btn :disabled="loading" :title="$t('plugins.gcodeViewer.loadLocalGCode.title')" block
									   color="primary" prepend-icon="mdi-file" @click="chooseFile">
									{{ $t("plugins.gcodeViewer.loadLocalGCode.caption") }}
								</v-btn>
								<input ref="fileInput" type="file" accept=".g,.gcode,.gc,.gco,.nc,.ngc,.tap" hidden multiple
									   @change="fileSelected" />

								<v-divider class="my-1" />

								<div class="d-flex flex-column">
									<v-switch v-model="showObjectSelection" :disabled="!canCancelObject"
											  :label="jobSelectionLabel" color="primary" hide-details />
									<v-switch v-model="showCursor" :label="$t('plugins.gcodeViewer.showCursor')"
											  color="primary" hide-details />
									<v-switch v-model="showTravelLines" :label="$t('plugins.gcodeViewer.showTravels')"
											  color="primary" hide-details />
									<v-switch v-model="persistTravels" :label="$t('plugins.gcodeViewer.persistTravels')"
											  color="primary" hide-details />
									<v-switch v-model="viewGCode" :label="$t('plugins.gcodeViewer.viewGCode')"
											  color="primary" hide-details />
								</div>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel value="quality">
						<v-expansion-panel-title :title="$t('plugins.gcodeViewer.renderQuality.title')">
							<v-icon class="mr-2">mdi-checkerboard</v-icon>
							<strong>{{ $t("plugins.gcodeViewer.renderQuality.caption") }}</strong>
						</v-expansion-panel-title>
						<v-expansion-panel-text eager>
							<div class="d-flex flex-column ga-3">
								<div>
									<div class="text-title-small mb-1">{{ $t("plugins.gcodeViewer.maxFps") }}</div>
									<v-slider v-model="maxFps" :max="60" :min="5" :step="5" thumb-label hide-details />
								</div>
								<div class="d-flex flex-column">
									<v-checkbox v-model="useHQRendering" :label="$t('plugins.gcodeViewer.useHQRendering')"
												color="primary" hide-details />
									<v-checkbox v-model="forceWireMode"
												:label="$t('plugins.gcodeViewer.forceLineRendering')"
												color="primary" hide-details />
									<v-checkbox v-model="perimeterOnly" :label="$t('plugins.gcodeViewer.perimeterOnly')"
												color="primary" hide-details />
									<v-checkbox v-model="progressMode" :label="$t('plugins.gcodeViewer.progressMode')"
												color="primary" hide-details />
									<v-checkbox v-model="vertexAlpha" :label="$t('plugins.gcodeViewer.transparency')"
												color="primary" hide-details />
									<v-slider v-if="vertexAlpha" v-model="transparencyPercent" min="1" max="100"
											  hide-details />
									<v-checkbox v-model="specular" :label="$t('plugins.gcodeViewer.useSpecular')"
												color="primary" hide-details />
								</div>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel>
						<v-expansion-panel-title :title="$t('plugins.gcodeViewer.extruders.title')">
							<v-icon class="mr-2">mdi-printer-3d-nozzle</v-icon>
							<strong>{{ $t("plugins.gcodeViewer.extruders.caption") }}</strong>
						</v-expansion-panel-title>
						<v-expansion-panel-text>
							<div class="d-flex flex-column ga-3">
								<v-btn :disabled="loading" :title="$t('plugins.gcodeViewer.reloadView.title')" block
									   color="primary" @click="reloadviewer">
									{{ $t("plugins.gcodeViewer.reloadView.caption") }}
								</v-btn>
								<div v-for="(extruder, index) in toolColors" :key="index">
									<div class="text-title-small mb-2">{{ $t("plugins.gcodeViewer.tool", [index]) }}</div>
									<ColorPicker :editcolor="extruder"
												 @updatecolor="(value) => updateColor(index, value)" />
								</div>
								<v-btn block color="warning" @click="resetExtruderColors">
									{{ $t("plugins.gcodeViewer.resetColor", toolColors.length) }}
								</v-btn>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel>
						<v-expansion-panel-title :title="$t('plugins.gcodeViewer.renderMode.title')">
							<v-icon class="mr-2">mdi-palette</v-icon>
							<strong>{{ $t("plugins.gcodeViewer.renderMode.caption", 2) }}</strong>
						</v-expansion-panel-title>
						<v-expansion-panel-text>
							<div class="d-flex flex-column ga-3">
								<v-btn-toggle v-model="colorMode" mandatory class="btn-toggle d-flex">
									<v-btn :disabled="loading" :value="0" block>{{ $t("plugins.gcodeViewer.color") }}</v-btn>
									<v-btn :disabled="loading" :value="1" block>{{ $t("plugins.gcodeViewer.feedrate") }}</v-btn>
									<v-btn :disabled="loading" :value="2" block>{{ $t("plugins.gcodeViewer.feature") }}</v-btn>
								</v-btn-toggle>
								<v-checkbox v-model="g1AsExtrusion" :label="$t('plugins.gcodeViewer.g1AsExtrusion')"
											color="primary" hide-details />
								<div>
									<div class="text-title-small mb-1">{{ $t("plugins.gcodeViewer.minFeedrate") }}</div>
									<v-slider v-model="minColorRate" :max="500" :min="5" thumb-label hide-details />
								</div>
								<div>
									<div class="text-title-small mb-1">{{ $t("plugins.gcodeViewer.maxFeedrate") }}</div>
									<v-slider v-model="maxColorRate" :max="500" :min="5" thumb-label hide-details />
								</div>
								<div>
									<div class="text-title-small mb-2">{{ $t("plugins.gcodeViewer.minFeedrateColor") }}</div>
									<ColorPicker :editcolor="minFeedColor"
												 @updatecolor="(value) => updateMinFeedColor(value)" />
								</div>
								<div>
									<div class="text-title-small mb-2">{{ $t("plugins.gcodeViewer.maxFeedrateColor") }}</div>
									<ColorPicker :editcolor="maxFeedColor"
												 @updatecolor="(value) => updateMaxFeedColor(value)" />
								</div>
								<v-btn :disabled="loading" :title="$t('plugins.gcodeViewer.reloadView.title')" block
									   color="primary" @click="reloadviewer">
									{{ $t("plugins.gcodeViewer.reloadView.caption") }}
								</v-btn>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel>
						<v-expansion-panel-title :title="$t('plugins.gcodeViewer.progress.title')">
							<v-icon class="mr-2">mdi-progress-clock</v-icon>
							<strong>{{ $t("plugins.gcodeViewer.progress.caption") }}</strong>
						</v-expansion-panel-title>
						<v-expansion-panel-text>
							<div class="d-flex flex-column ga-3">
								<div>
									<div class="text-title-small mb-1">{{ $t("plugins.gcodeViewer.topClipping") }}</div>
									<v-slider v-model="sliderHeight" :max="maxHeight" :min="minHeight" step="0.1"
											  thumb-label hide-details />
								</div>
								<div>
									<div class="text-title-small mb-1">{{ $t("plugins.gcodeViewer.bottomClipping") }}</div>
									<v-slider v-model="sliderBottomHeight" :max="maxHeight" :min="minHeight" step="0.1"
											  thumb-label hide-details />
								</div>
								<div>
									<div class="text-title-small mb-2">{{ $t("plugins.gcodeViewer.progressColor") }}</div>
									<ColorPicker :editcolor="progressColor"
												 @updatecolor="(value) => updateProgressColor(value)" />
								</div>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel>
						<v-expansion-panel-title>
							<v-icon class="mr-2">mdi-cog</v-icon>
							<strong>{{ $t("plugins.gcodeViewer.settings") }}</strong>
						</v-expansion-panel-title>
						<v-expansion-panel-text>
							<div class="d-flex flex-column ga-3">
								<div>
									<div class="text-title-small mb-2">{{ $t("plugins.gcodeViewer.background") }}</div>
									<ColorPicker :editcolor="backgroundColor"
												 @updatecolor="(value) => updateBackground(value)" />
								</div>
								<div>
									<div class="text-title-small mb-2">{{ $t("plugins.gcodeViewer.bedRenderMode") }}</div>
									<v-btn-toggle v-model="bedRenderMode" mandatory class="d-flex flex-column mb-3">
										<v-btn :value="0" block>{{ $t("plugins.gcodeViewer.bed") }}</v-btn>
										<v-btn :value="1" block>{{ $t("plugins.gcodeViewer.volume") }}</v-btn>
									</v-btn-toggle>
									<ColorPicker :editcolor="bedColor"
												 @updatecolor="(value) => updateBedColor(value)" />
								</div>
								<div class="d-flex flex-column">
									<v-checkbox v-model="showOverlay" :label="$t('plugins.gcodeViewer.showFSOverlay')"
												color="primary" hide-details />
									<v-checkbox v-model="showAxes" :label="$t('plugins.gcodeViewer.showAxes')"
												color="primary" hide-details />
									<v-checkbox v-model="showObjectLabels"
												:label="$t('plugins.gcodeViewer.showObjectLabels')"
												color="primary" hide-details />
									<v-checkbox v-model="showWorkplace"
												:label="$t('plugins.gcodeViewer.showWorkplace')"
												color="primary" hide-details />
									<v-switch v-model="cameraInertia" :label="$t('plugins.gcodeViewer.cameraInertia')"
											  color="primary" hide-details />
									<v-switch v-model="zBelt" :label="$t('plugins.gcodeViewer.zBelt')"
											  color="primary" hide-details />
								</div>
								<v-text-field v-model.number="zBeltAngle" type="number"
											  :label="$t('plugins.gcodeViewer.zBeltAngle')"
											  density="compact" variant="outlined" hide-details />
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>
					</v-expansion-panels>
				</aside>
			</Transition>

			<div v-show="!followingJob && scrubFileSize > 0"
				 :class="[{ 'button-container-drawer': drawer }, scrubberClass]">
				<v-row class="scrubber-row">
					<v-col cols="10" md="5">
						<v-slider v-model="scrubPosition" :hint="`${scrubPosition}/${scrubFileSize}`"
								  :max="scrubFileSize" min="0" density="compact" persistent-hint hide-details
								  @update:model-value="scrubPositionChanged" />
					</v-col>
					<v-col cols="2">
						<v-row density="compact">
							<v-col cols="12">
								<v-btn @click="simulatePlay">
									<v-icon v-if="scrubPlaying">mdi-stop</v-icon>
									<v-icon v-else>mdi-play</v-icon>
								</v-btn>
								<v-btn @click="fastForward">
									<v-icon>mdi-fast-forward</v-icon>
								</v-btn>
							</v-col>
						</v-row>
					</v-col>
					<v-col cols="12" md="5">
						<v-btn-toggle v-model="scrubSpeed" mandatory rounded color="secondary" class="w-100">
							<v-btn :value="1" class="flex-grow-1">1x</v-btn>
							<v-btn :value="2" class="flex-grow-1">2x</v-btn>
							<v-btn :value="5" class="flex-grow-1">5x</v-btn>
							<v-btn :value="10" class="flex-grow-1">10x</v-btn>
							<v-btn :value="20" class="flex-grow-1">20x</v-btn>
							<v-btn :value="100" class="flex-grow-1">100x</v-btn>
						</v-btn-toggle>
					</v-col>
				</v-row>
			</div>
		</div>
		</Teleport>

		<v-dialog v-model="objectDialogData.showDialog" max-width="300">
			<v-card>
				<v-card-title class="headline">
					<v-icon class="mr-2">
						{{ objectDialogData.info.cancelled ? "mdi-reload" : "mdi-cancel" }}
					</v-icon>
					{{ objectDialogData.info.cancelled
						? $t("plugins.gcodeViewer.resumeObj")
						: $t("plugins.gcodeViewer.cancelObj") }}
				</v-card-title>
				<v-card-text>{{ objectDialogData.info.name }}</v-card-text>
				<v-card-actions>
					<v-btn width="130" color="primary" @click="objectDialogCancelObject">
						{{ objectDialogData.info.cancelled
							? $t("plugins.gcodeViewer.resumeObj")
							: $t("plugins.gcodeViewer.cancelObj") }}
					</v-btn>
					<v-spacer />
					<v-btn width="130" color="error" @click="objectDialogData.showDialog = false">
						{{ $t("generic.close") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { type Job, KinematicsName, type Move, type State } from "@duet3d/objectmodel";
import { useDisplay } from "vuetify";
import { Viewer_Proxy, type LoadFileResult } from "@duet3d/gcodeviewer";

import CodeButton from "@/components/buttons/CodeButton.vue";
import i18n from "@/i18n";
import { useCacheStore } from "@/stores/cache";
import { useMachineStore } from "@/stores/machine";
import { useSettingsStore } from "@/stores/settings";
import { LogLevel, useUiStore } from "@/stores/ui";
import { isPrinting } from "@/utils/enums";
import Path from "@/utils/path";

import CodeStream from "./CodeStream.vue";
import ColorPicker from "./ColorPicker.vue";
import FSOverlay from "./FSOverlay.vue";

interface ObjectInfo {
	cancelled: boolean;
	index: number;
	name?: string;
}

const machineStore = useMachineStore();
const cacheStore = useCacheStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const display = useDisplay();
const route = useRoute();

// The standalone page lives under /Plugins/GCodeViewer and sizes itself to the viewport; rendered
// anywhere else (e.g. as a tab in the Job Status view panel) it fills its container instead
const isEmbedded = computed(() => !route.path.startsWith("/Plugins/GCodeViewer"));

// Intentionally module-scope (not a ref) - Babylon's internals don't survive Vue's reactive
// proxy walk; the template never reads `viewer` directly so losing reactivity is safe
let viewer: Viewer_Proxy | null = null;

const primaryContainer = ref<HTMLElement | null>(null);
const viewerCanvas = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const drawer = ref(false);
// Open the View / Actions group by default when the drawer first comes up - it carries the
// reset/reload/load buttons + the toggles a user most often reaches for
const openDrawerPanel = ref<string>("view");

const backgroundColor = ref("#000000FF");
const progressColor = ref("#FFFFFFFF");
const loading = ref(false);
const showTravelLines = ref(false);
const persistTravels = ref(false);
const selectedFile = ref("");
// Direct control over the fork's actual render-cost knob, replacing the old 1-6 preset that never
// mapped to anything the fork exposes
const maxFps = ref(30);
const maxHeight = ref(0);
const minHeight = ref(0);
const sliderHeight = ref(0);
const sliderBottomHeight = ref(0);
const forceWireMode = ref(false);
const vertexAlpha = ref(false);
const showObjectSelection = ref(false);
const objectDialogData = reactive({
	showDialog: false,
	info: {} as ObjectInfo,
});
const hoverLabel = ref("");
const bedRenderMode = ref(0);
const showAxes = ref(true);
const showObjectLabels = ref(true);
const fullscreen = ref(false);
// Matches Bed's own default (src/Renderables/bed.ts in the fork) - the fork has no getter for
// this, so rather than reading its default back on mount, this is pushed to the viewer instead
const bedColor = ref("#0000FF");
const colorMode = ref(0);
const minColorRate = ref(20);
const maxColorRate = ref(60);
const maxFileFeedRate = ref(0);
const minFeedColor = ref("#0000FF");
const maxFeedColor = ref("#FF0000");
const cameraInertia = ref(true);
const loadingProgress = ref(0);
const loadingMessage = ref("");
const showOverlay = ref(true);
const scrubPosition = ref(0);
const scrubFileSize = ref(0);
const scrubPlaying = ref(false);
const scrubSpeed = ref(1);
let colorDebounce: ReturnType<typeof setTimeout> | null = null;
let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
const fileData = ref("");
const perimeterOnly = ref(false);
const transparencyPercent = ref(50);
const progressMode = ref(false);

// True only while the viewer actively follows the running print head (live tracking). The Job
// Status tab turns this on automatically; the standalone page leaves it off and renders the whole
// file as finished, so the user can scrub it - they opt into live view via the "load current job"
// button, which also re-enables per-object cancellation
const followingJob = ref(false);

// #region OM-derived computeds
const job = computed<Job>(() => machineStore.model.job);
const move = computed<Move>(() => machineStore.model.move);
const state = computed<State>(() => machineStore.model.state);
const pluginCache = computed<any>(() => cacheStore.plugins.GCodeViewer);

const isJobRunning = computed(() => isPrinting(state.value.status));

const visualizingCurrentJob = computed(() => {
	try {
		return job.value.file?.fileName === selectedFile.value && isJobRunning.value;
	} catch {
		return false;
	}
});

const filePosition = computed(() => Number(job.value.filePosition ?? 0));

const kinematicsName = computed(() => move.value.kinematics.name);
const isDelta = computed(() => kinematicsName.value === KinematicsName.linearDelta
	|| kinematicsName.value === KinematicsName.rotaryDelta);

const canCancelObject = computed(() => {
	try {
		if (!isJobRunning.value || (job.value.build?.objects?.length ?? 0) <= 0) {
			return false;
		}
		return followingJob.value;
	} catch {
		return false;
	}
});

const jobSelectionLabel = computed(() => {
	let label = i18n.global.t("plugins.gcodeViewer.showObjectSelection.caption");
	if (canCancelObject.value && job.value.build?.objects) {
		label += ` (${job.value.build.objects.length})`;
	}
	return label;
});

// #endregion

// #region Cached plugin settings
const toolColors = computed<string[]>({
	get: () => pluginCache.value?.toolColors ?? [],
	set: (value) => cacheStore.setPluginData("GCodeViewer", "toolColors", value),
});

const useHQRendering = computed<boolean>({
	get: () => pluginCache.value?.useHQRendering ?? false,
	set: (value) => cacheStore.setPluginData("GCodeViewer", "useHQRendering", value),
});

const specular = computed<boolean>({
	get: () => pluginCache.value?.useSpecular ?? true,
	set: (value) => cacheStore.setPluginData("GCodeViewer", "useSpecular", value),
});

const g1AsExtrusion = computed<boolean>({
	get: () => pluginCache.value?.g1AsExtrusion ?? false,
	set: (value) => cacheStore.setPluginData("GCodeViewer", "g1AsExtrusion", value),
});

const viewGCode = computed<boolean>({
	get: () => pluginCache.value?.viewGCode ?? false,
	set: (value) => {
		cacheStore.setPluginData("GCodeViewer", "viewGCode", value);
		// fileData is kept populated regardless of viewGCode's state (see the various load call
		// sites) - the fork has no cached copy of the raw text to pull from like the old package
		// did, so toggling this on only works if DWC already held onto the text itself
		resize();
	},
});

const zBelt = computed<boolean>({
	get: () => pluginCache.value?.zBelt ?? false,
	set: (value) => cacheStore.setPluginData("GCodeViewer", "zBelt", value),
});

const zBeltAngle = computed<number>({
	get: () => pluginCache.value?.zBeltAngle ?? 45,
	set: (value) => cacheStore.setPluginData("GCodeViewer", "zBeltAngle", value),
});

const showWorkplace = computed<boolean>({
	get: () => pluginCache.value?.showWorkplace ?? true,
	set: (value) => cacheStore.setPluginData("GCodeViewer", "showWorkplace", value),
});

const showCursor = computed<boolean>({
	get: () => pluginCache.value?.showCursor ?? false,
	set: (value) => cacheStore.setPluginData("GCodeViewer", "showCursor", value),
});

// #endregion

// #region Layout-driven class swaps
const viewerClass = computed(() => {
	nextTick(() => resize());
	return viewGCode.value ? "babylon-canvas-codeview" : "babylon-canvas";
});

const scrubberClass = computed(() => {
	if (display.mdAndDown.value) {
		return viewGCode.value ? "scrubber-sm-codeview" : "scrubber-sm";
	}
	return viewGCode.value ? "scrubber-codeview" : "scrubber";
});

const codeViewClass = computed(() => (display.mdAndDown.value ? "codeview-sm" : "codeview"));
const emergencyButtonClass = computed(() => viewGCode.value
	? "emergency-button-placement-codeview"
	: "emergency-button-placement");

const workplaceOffsets = computed(() => {
	const offsets: number[] = [];
	try {
		for (const axis of move.value.axes) {
			offsets.push(...axis.workplaceOffsets);
		}
	} catch {
		// Defensive - if axes haven't loaded yet, empty list is fine
	}
	return offsets;
});

const currentWorkplace = computed(() => {
	return move.value.motionSystems[machineStore.selectedMotionSystem]?.workplaceNumber ?? 0;
});

// #endregion

// #region Viewer lifecycle
async function loadSdFile(path: string) {
	selectedFile.value = path;
	followingJob.value = false;
	if (!viewer) {
		return;
	}
	try {
		const fileText = await machineStore.download({
			filename: Path.combine(path),
			type: "text",
		}, false, false, false);
		loading.value = true;
		preLoadSettings();
		const result = await viewer.loadFile(fileText);
		if (result.failed) {
			uiStore.makeNotification(LogLevel.warning,
				i18n.global.t("plugins.gcodeViewer.caption"),
				i18n.global.t("plugins.gcodeViewer.renderFailed"), 5000);
		}
		fileData.value = fileText;
		scrubFileSize.value = result.end;
		setGCodeValues(result);
		applyDefaultOrientation();
	} finally {
		loading.value = false;
	}
}

// Resolve the SD-card file path from the route's `:volume?/:path(.*)?` params. Empty when the
// page was opened at its bare path with no file to preview
function sdPathFromRoute(): string {
	const params = route.params as Record<string, string | string[] | undefined>;
	const rawVolume = Array.isArray(params.volume) ? params.volume[0] : params.volume;
	const rawPath = Array.isArray(params.path) ? params.path.join("/") : params.path;
	const filePath = rawPath ?? "";
	if (filePath === "") {
		return "";
	}
	const volume = rawVolume && /^\d+$/.test(rawVolume) ? rawVolume : "0";
	return `${volume}:/${filePath}`;
}

// Load whatever the route asks for: a deep-linked file, or - at the bare path - the running job
function loadFromRoute() {
	const filePath = sdPathFromRoute();
	if (filePath) {
		if (filePath !== selectedFile.value) {
			loadSdFile(filePath);
		}
	} else {
		autoLoadRunningJob();
	}
}

// Default camera placement: a front view tilted 45 deg down. For an ArcRotateCamera alpha -PI/2
// faces the front edge and beta PI/4 is the tilt. In the embedded Job Status tab the look-at point
// and orbit radius frame the printed geometry; the standalone page keeps the whole-bed framing
// The actual framing math now lives in the fork (Viewer.frameToContent(), ported near-verbatim
// from what used to be here) - it needs the real camera/engine, which only exist inside the
// worker now. This just forwards the one piece of state the fork can't know on its own: whether
// this instance is embedded (Job Status tab, frames the print) or standalone (frames the bed).
function applyDefaultOrientation() {
	viewer?.frameToContent(isEmbedded.value);
}

function onKeyUp(e: KeyboardEvent) {
	const key = e.key;
	if (key === "Escape" || key === "Esc") {
		fullscreen.value = false;
		nextTick(() => viewer?.resize());
	}
}

function onWindowResize() {
	nextTick(() => resize());
}

// DWC's colorMode is 0=tool/color, 1=feedrate, 2=feature; the fork's renderMode is 0=feature,
// 1=tool, 2=feedrate - these are NOT interchangeable, a silent numeric passthrough would be wrong
function mapColorModeToRenderMode(mode: number): number {
	switch (mode) {
		case 0: return 1; // tool/color
		case 1: return 2; // feedrate
		case 2: return 0; // feature
		default: return 0;
	}
}

// The old viewer tracked forceWireMode and useHighQualityExtrusion as independent booleans; the
// fork collapses box/high-quality-cylinder/wire into a single tri-state mesh mode, so wire mode
// (if set) wins over high-quality - there's no way to combine them
function computeMeshMode(forceWireMode: boolean, useHQRendering: boolean): number {
	if (forceWireMode) {
		return 2;
	}
	return useHQRendering ? 1 : 0;
}

onMounted(async () => {
	if (!viewerCanvas.value) {
		return;
	}
	viewer = new Viewer_Proxy(viewerCanvas.value);

	// The fork has no getters for any viewer-side state - unlike the old package, which was read
	// back to seed these refs, everything below is instead pushed FROM this component's own
	// (already-declared) defaults INTO the viewer, so behavior doesn't depend on the fork's
	// internal defaults matching what this UI assumes.
	viewer.passThru = (e: any) => {
		switch (e.type) {
			case "objectSelected":
				objectDialogData.showDialog = true;
				objectDialogData.info = e.object;
				break;
			case "objectLabel":
				hoverLabel.value = showObjectSelection.value ? e.name : "";
				break;
			case "progress":
				loadingProgress.value = Math.ceil(e.progress * 100);
				loadingMessage.value = e.label ?? "";
				break;
			case "animationStopped":
				scrubPlaying.value = false;
				break;
			// TODO(Phase 5b): wire 'animationPositionUpdate' to scrubPosition once live
			// machine-position nozzle tracking replaces/supplements file-position tracking here
		}
	};

	viewer.init();

	// Rust/WASM parsing fast path - falls back to the pure-TypeScript parser automatically if the
	// .wasm asset fails to load/instantiate under DWC's bundling/CSP (never verified in a real
	// consumer app until now), so a failure here is expected-and-handled, not fatal to the mount.
	try {
		await viewer.enableWasmProcessing();
	} catch (error) {
		console.warn("GCodeViewer: WASM fast path unavailable, using TypeScript parser", error);
	}

	const axisRange: Partial<Record<"x" | "y" | "z", { min: number; max: number }>> = {};
	for (const axis of move.value.axes) {
		if ("XYZ".includes(axis.letter)) {
			axisRange[axis.letter.toLowerCase() as "x" | "y" | "z"] = { min: axis.min, max: axis.max };
		}
	}
	if (axisRange.x && axisRange.y && axisRange.z) {
		viewer.setBuildVolume({ x: axisRange.x, y: axisRange.y, z: axisRange.z });
	}

	viewer.setDeltaBed(isDelta.value);
	viewer.setBedRenderMode(bedRenderMode.value);
	viewer.setBedColor(bedColor.value);
	viewer.showAxes(showAxes.value);
	viewer.showObjectLabels(showObjectLabels.value);
	viewer.setCameraInertia(cameraInertia.value);
	viewer.setBackgroundColor(backgroundColor.value);
	viewer.setProgressColor(progressColor.value);
	viewer.setRenderMode(mapColorModeToRenderMode(colorMode.value));
	viewer.setMeshMode(computeMeshMode(forceWireMode.value, useHQRendering.value));
	viewer.setMaxFPS(maxFps.value);
	viewer.setAlphaMode(vertexAlpha.value);
	viewer.setProgressMode(progressMode.value);
	viewer.setPerimeterOnly(perimeterOnly.value);
	viewer.setZBelt(zBelt.value, zBeltAngle.value);
	viewer.setG1AsExtrusion(g1AsExtrusion.value);
	// "Cursor" visibility's exact old meaning is unverified (no source for the old package was
	// available) - mapping to the nozzle/tool-position marker as the closest analog. Revisit if
	// this turns out to mean something else once compared side-by-side with the old viewer.
	viewer.toggleNozzle(showCursor.value);
	viewer.setShowTravels(showTravelLines.value);
	viewer.setPersistTravels(persistTravels.value);
	viewer.setFeedColors(minFeedColor.value, maxFeedColor.value);
	// The slider labels are mm/s (matching the F-command convention shown elsewhere in DWC) but
	// the fork/G-code feed rates are mm/min, hence the *60 conversion
	viewer.setFeedRateRange(minColorRate.value * 60, maxColorRate.value * 60);
	viewer.showWorkplace(showWorkplace.value);
	viewer.setTransparency(transparencyPercent.value);
	viewer.setUseSpecular(specular.value);

	nextTick(() => {
		updateTools();
		updateWorkplaces();
	});

	window.addEventListener("keyup", onKeyUp);
	window.addEventListener("resize", onWindowResize);

	applyDefaultOrientation();

	// A file deep-linked into the route (Jobs list "View 3D" navigation arrives this way) loads
	// immediately; at the bare path the viewer falls back to the running job instead
	loadFromRoute();
});

// Re-entering the kept-alive page, or navigating to a different file while it stays mounted,
// re-resolves what the route asks for
onActivated(() => {
	loadFromRoute();
});
watch(sdPathFromRoute, loadFromRoute);

onBeforeUnmount(() => {
	window.removeEventListener("keyup", onKeyUp);
	window.removeEventListener("resize", onWindowResize);
	if (colorDebounce) {
		clearTimeout(colorDebounce);
	}
	if (resizeDebounce) {
		clearTimeout(resizeDebounce);
	}
	// Must be called before dropping the reference, or the worker (and everything it owns -
	// Babylon engine, WASM instance) leaks for the lifetime of the page
	viewer?.unload();
	viewer = null;
});

// #endregion

// #region Methods
function simulatePlay() {
	if (!viewer) {
		return;
	}
	// scrubPlaying already reflects the fork's actual state: it flips true here, and back to
	// false either here (pausing) or via the 'animationStopped' passThru event (finished/aborted)
	if (scrubPlaying.value) {
		viewer.stopNozzleAnimation();
		scrubPlaying.value = false;
	} else {
		viewer.startNozzleAnimation();
		scrubPlaying.value = true;
	}
}

function scrubPositionChanged(value: number) {
	if (!viewer) {
		return;
	}
	scrubPosition.value = value;
	// animate: false - jump straight to this position; the fork resumes any in-progress
	// animation from here automatically if it was already playing
	viewer.updateFilePosition(value, false);
}

function updateColor(index: number, value: string) {
	if (!viewer) {
		return;
	}
	const next = toolColors.value.slice();
	next[index] = value;
	viewer.setTools(next.map((color) => ({ color, diameter: 0.4 })));
	if (colorDebounce) {
		clearTimeout(colorDebounce);
	}
	colorDebounce = setTimeout(() => {
		cacheStore.setPluginData("GCodeViewer", "toolColors", next);
	}, 200);
}

function updateBackground(value: string) {
	backgroundColor.value = value;
	viewer?.setBackgroundColor(value);
}

function updateProgressColor(value: string) {
	progressColor.value = value;
	viewer?.setProgressColor(value);
}

function updateMinFeedColor(value: string) {
	minFeedColor.value = value;
	viewer?.setFeedColors(value, maxFeedColor.value);
}

function updateMaxFeedColor(value: string) {
	maxFeedColor.value = value;
	viewer?.setFeedColors(minFeedColor.value, value);
}

function updateBedColor(value: string) {
	bedColor.value = value;
	viewer?.setBedColor(value);
}

function resize() {
	if (resizeDebounce) {
		clearTimeout(resizeDebounce);
	}
	resizeDebounce = setTimeout(() => {
		if (!primaryContainer.value) {
			return;
		}
		// On the standalone page the container has no bounded height of its own, so size it to the
		// viewport minus the appbar + container padding (floored so a cramped window stays usable).
		// xs/sm: layout strips its outer padding, but the viewer adds an 8px breathing margin
		// (top + bottom = 16) on top of the appbar. md+ uses the layout's 16px top/bottom
		// padding (32) and the viewer sits flush with that frame. Embedded, the host panel bounds
		// the height, so leave the CSS height: 100% in charge and only resync the canvas
		if (!isEmbedded.value) {
			const mainElement = document.querySelector(".v-main");
			const appBarHeight = mainElement
				? parseInt(getComputedStyle(mainElement).getPropertyValue("--v-layout-top")) || 64
				: 64;
			const chrome = appBarHeight + (display.mdAndUp.value ? 32 : 16);
			const viewerHeight = Math.max(window.innerHeight - chrome, 400);
			primaryContainer.value.style.height = `${viewerHeight}px`;
		}
		viewer?.resize();
	}, 500);
}

function reset() {
	applyDefaultOrientation();
}

// Loads the job currently being processed, but only when the viewer is idle and empty - an
// explicit file selection or an in-progress load is left untouched. The embedded Job Status tab
// follows the live print head; the standalone page renders the whole file as finished instead
function autoLoadRunningJob() {
	if (isJobRunning.value && !loading.value && !visualizingCurrentJob.value && selectedFile.value === "") {
		loadRunningJob(isEmbedded.value);
	}
}

async function loadRunningJob(live = true) {
	if (!viewer || !job.value.file) {
		return;
	}
	viewer.stopNozzleAnimation();
	scrubPlaying.value = false;
	if (selectedFile.value !== job.value.file.fileName) {
		selectedFile.value = "";
		await viewer.clear();
	}
	selectedFile.value = job.value.file.fileName;
	followingJob.value = live;

	try {
		const fileText = await machineStore.download({
			filename: job.value.file.fileName,
			type: "text",
		}, false, false, false);
		loading.value = true;
		preLoadSettings();
		const result = await viewer.loadFile(fileText);
		if (result.failed) {
			uiStore.makeNotification(LogLevel.warning,
				i18n.global.t("plugins.gcodeViewer.caption"),
				i18n.global.t("plugins.gcodeViewer.renderFailed"), 5000);
		}
		fileData.value = fileText;
		scrubFileSize.value = result.end;
		setGCodeValues(result);
		applyDefaultOrientation();
		viewer.loadObjectBoundaries(job.value.build?.objects ?? []);
	} finally {
		// The fork has no dedicated "live tracking" mode - it just reflects whatever file
		// position was last pushed, so "finished" here just means jumping to the very end
		if (live) {
			viewer.updateFilePosition(0);
		} else {
			showCompletedPrint();
		}
		loading.value = false;
	}
}

function resetExtruderColors() {
	toolColors.value = ["#00FFFF", "#FF00FF", "#FFFF00", "#000000", "#FFFFFF"];
	updateTools();
}

async function reloadviewer() {
	if (loading.value || !viewer) {
		return;
	}
	loading.value = true;
	preLoadSettings();
	if (fileData.value.length > 0 || selectedFile.value.length > 0) {
		const result = await viewer.reload();
		scrubFileSize.value = result.end;
		setGCodeValues(result);
	}
	loading.value = false;

	viewer.toggleNozzle(showCursor.value);
	// scrubPosition only reflects a real "where the user was scrubbing to" value while actively
	// following a live job - otherwise (a manually loaded/completed file) it was never advanced
	// past its 0 default, so pushing it here would hide the whole reloaded model behind the
	// shader's "not yet printed" discard. Match loadRunningJob(false)'s pattern instead: show the
	// complete model.
	if (followingJob.value) {
		viewer.updateFilePosition(scrubPosition.value);
	} else {
		showCompletedPrint();
		scrubPosition.value = scrubFileSize.value;
	}

	viewer.loadObjectBoundaries(job.value.build?.objects ?? []);
}

function clearScene() {
	selectedFile.value = "";
	viewer?.clear();
}

// Reveal the whole file once live tracking ends by jumping to the very end file position - the
// fork clips rendered geometry purely by the last position pushed to it, so there's no separate
// "finalize" step needed (unlike the old viewer's doFinalPass(), which this replaces).
function showCompletedPrint() {
	if (!viewer) {
		return;
	}
	viewer.updateFilePosition(Number.MAX_VALUE);
}

async function objectDialogCancelObject() {
	objectDialogData.showDialog = false;
	const action = objectDialogData.info.cancelled ? "U" : "P";
	await machineStore.sendCode(`M486 ${action}${objectDialogData.info.index}`);
	objectDialogData.info = {} as ObjectInfo;
}

function chooseFile() {
	if (!loading.value) {
		fileInput.value?.click();
	}
}

function setGCodeValues(result: LoadFileResult) {
	if (!g1AsExtrusion.value) {
		maxHeight.value = zBelt.value ? 500 : result.maxHeight;
		minHeight.value = result.minHeight;
	} else {
		maxHeight.value = 100000;
		minHeight.value = -100000;
	}
	sliderHeight.value = maxHeight.value;
	loading.value = false;
	maxFileFeedRate.value = result.maxFeedRate;
	sliderBottomHeight.value = minHeight.value < 0 ? minHeight.value : 0;
}

function preLoadSettings() {
	if (!viewer) {
		return;
	}
	viewer.setMeshMode(computeMeshMode(forceWireMode.value, useHQRendering.value));
	viewer.setPerimeterOnly(perimeterOnly.value);
	viewer.setProgressMode(progressMode.value);
	viewer.setZBelt(zBelt.value, zBeltAngle.value);
	viewer.setG1AsExtrusion(g1AsExtrusion.value);
}

async function fileSelected(e: Event) {
	const reader = new FileReader();
	reader.addEventListener("load", async (event) => {
		if (!viewer) {
			return;
		}
		preLoadSettings();
		const text = event.target!.result as string;
		const result = await viewer.loadFile(text);
		if (result.failed) {
			uiStore.makeNotification(LogLevel.warning,
				i18n.global.t("plugins.gcodeViewer.caption"),
				i18n.global.t("plugins.gcodeViewer.renderFailed"), 5000);
		}
		fileData.value = text;
		followingJob.value = false;
		scrubFileSize.value = result.end;
		setGCodeValues(result);
		applyDefaultOrientation();
		showCompletedPrint();
		scrubPosition.value = scrubFileSize.value;
	});
	loading.value = true;
	const input = e.target as HTMLInputElement;
	if (input.files?.[0]) {
		reader.readAsText(input.files[0]);
	}
	input.value = "";
}

function toggleFullScreen() {
	fullscreen.value = !fullscreen.value;
	nextTick(() => viewer?.resize());
}

function cancelLoad() {
	viewer?.cancelLoad();
}

function fastForward() {
	if (!viewer) {
		return;
	}
	viewer.stopNozzleAnimation();
	scrubPlaying.value = false;
	scrubPosition.value = scrubFileSize.value;
	viewer.updateFilePosition(scrubFileSize.value);
}

// Builds the fork's expected { x, y, z }[] (one entry per G54-G59.3 workplace) from the object
// model, which instead exposes offsets per-axis (axis.workplaceOffsets[workplaceIndex])
function updateWorkplaces() {
	if (!viewer) {
		return;
	}
	const offsets: { x: number; y: number; z: number }[] = [];
	for (const axis of move.value.axes) {
		if (!"XYZ".includes(axis.letter)) {
			continue;
		}
		const letter = axis.letter.toLowerCase() as "x" | "y" | "z";
		axis.workplaceOffsets.forEach((offset, idx) => {
			if (!offsets[idx]) {
				offsets[idx] = { x: 0, y: 0, z: 0 };
			}
			offsets[idx][letter] = offset;
		});
	}
	if (offsets.length > 0) {
		viewer.setWorkplaceOffsets(offsets);
	}
	viewer.setCurrentWorkplaceIndex(currentWorkplace.value);
}

function updateTools() {
	if (!viewer) {
		return;
	}
	viewer.setTools(toolColors.value.map((color) => ({ color, diameter: 0.4 })));
}

// #endregion

// #region Watches
// Live machine-position nozzle tracking - only while the cursor/nozzle marker is visible and the
// viewer isn't already being driven by a followed job's file-position (see the filePosition watch
// below), which owns the nozzle while it's active
watch(move, () => {
	if (!viewer || !showCursor.value || followingJob.value) {
		return;
	}
	const position: Partial<Record<"x" | "y" | "z", number>> = {};
	for (const axis of move.value.axes) {
		if ("XYZ".includes(axis.letter) && axis.machinePosition !== null) {
			position[axis.letter.toLowerCase() as "x" | "y" | "z"] = axis.machinePosition;
		}
	}
	if (position.x !== undefined && position.y !== undefined && position.z !== undefined) {
		viewer.setNozzlePosition({ x: position.x, y: position.y, z: position.z });
	}
}, { deep: true });

watch(showCursor, (newValue) => {
	// "Cursor" visibility's exact old meaning is unverified - mapped to the nozzle/tool-position
	// marker as the closest analog (see onMounted and the plan doc)
	viewer?.toggleNozzle(newValue);
});

watch(showTravelLines, (newValue) => viewer?.setShowTravels(newValue));
watch(persistTravels, (newValue) => {
	viewer?.setPersistTravels(newValue);
	// Persisting travels implies showing them - only force the switch on, never off, so turning
	// persistTravels back off doesn't also hide travels the user separately enabled
	if (newValue) {
		showTravelLines.value = true;
	}
});

watch(visualizingCurrentJob, (newValue) => {
	if (!newValue) {
		followingJob.value = false;
		showCompletedPrint();
	}
});

watch(filePosition, (newValue) => {
	if (followingJob.value) {
		scrubPosition.value = newValue;
		viewer?.updateFilePosition(newValue + 1);
	}
});

watch(scrubSpeed, (to) => viewer?.setNozzleAnimationSpeed(to));

watch(sliderHeight, (newValue) => {
	if (sliderBottomHeight.value > newValue) {
		sliderBottomHeight.value = newValue - 1;
	}
	if (!g1AsExtrusion.value) {
		viewer?.setZClipPlane(newValue + 1, sliderBottomHeight.value);
	}
});

watch(sliderBottomHeight, (newValue) => {
	if (sliderHeight.value < newValue) {
		sliderHeight.value = newValue + 1;
	}
	if (!g1AsExtrusion.value) {
		viewer?.setZClipPlane(sliderHeight.value, newValue - 1);
	}
});

// vertexAlpha ("transparency" checkbox) is a boolean ghosting toggle - matches the fork's
// setAlphaMode(bool) directly, and (unlike the old package) needs no reparse to take effect
watch(vertexAlpha, (newValue) => viewer?.setAlphaMode(newValue));

watch(() => job.value.build?.objects, (newValue) => {
	if (viewer && newValue) {
		viewer.loadObjectBoundaries(newValue);
	}
}, { deep: true });

watch(showObjectSelection, (newValue) => {
	if (!viewer) {
		return;
	}
	if (canCancelObject.value) {
		viewer.loadObjectBoundaries(job.value.build?.objects ?? []);
		viewer.showObjectSelection(newValue);
	} else {
		showObjectSelection.value = false;
		hoverLabel.value = "";
	}
});

watch(isJobRunning, (newValue) => {
	if (!newValue) {
		followingJob.value = false;
		showCompletedPrint();
	}
});

watch(selectedFile, () => {
	showObjectSelection.value = false;
	viewer?.updateFilePosition(0);
});

watch(bedRenderMode, (newValue) => viewer?.setBedRenderMode(newValue));

watch(isDelta, (newValue) => {
	viewer?.setDeltaBed(newValue);
	viewer?.resetCamera();
});

watch(showAxes, (newValue) => viewer?.showAxes(newValue));
watch(showObjectLabels, (newValue) => viewer?.showObjectLabels(newValue));

// Mesh mode is a cheap, instant toggle in the fork (no reparse needed, unlike the old package)
watch(forceWireMode, (newValue) => viewer?.setMeshMode(computeMeshMode(newValue, useHQRendering.value)));
watch(useHQRendering, (newValue) => viewer?.setMeshMode(computeMeshMode(forceWireMode.value, newValue)));
watch(maxFps, (to) => viewer?.setMaxFPS(to));

// Render mode is also a cheap per-frame uniform switch in the fork - no reparse needed
watch(colorMode, (to) => viewer?.setRenderMode(mapColorModeToRenderMode(to)));

// mm/s -> mm/min, see the matching conversion in onMounted
watch(minColorRate, (to) => viewer?.setFeedRateRange(to * 60, maxColorRate.value * 60));
watch(maxColorRate, (to) => viewer?.setFeedRateRange(minColorRate.value * 60, to * 60));

watch(cameraInertia, (to) => viewer?.setCameraInertia(to));

watch(loading, (to) => {
	if (!to) {
		loadingProgress.value = 0;
	}
});

watch(specular, (to) => viewer?.setUseSpecular(to));

// CNC mode (treat every G1 as an extrusion) is also a parse-time setting - a reload is required
// for a change to actually take effect, same as zBelt below
watch(g1AsExtrusion, async (to) => {
	viewer?.setG1AsExtrusion(to);
	await reloadviewer();
});

// perimeterOnly is also a build-time filter (which segments get built into the mesh at all), not
// an instant shader toggle - previously had no watcher at all, so the checkbox did nothing until
// some unrelated setting change happened to trigger a reload
watch(perimeterOnly, async (to) => {
	viewer?.setPerimeterOnly(to);
	await reloadviewer();
});

// zBelt/gantry-angle are parse-time settings in the fork (unlike the old package, which appears
// to apply them live) - a reload is required for a change to actually take visual effect
watch(zBelt, async (to) => {
	viewer?.setZBelt(to, zBeltAngle.value);
	await reloadviewer();
});

watch(zBeltAngle, async (to) => {
	if (to < 0 || to > 90) {
		cacheStore.setPluginData("GCodeViewer", "zBeltAngle", 45);
		return;
	}
	viewer?.setZBelt(zBelt.value, to);
	await reloadviewer();
});

watch(workplaceOffsets, updateWorkplaces, { deep: true });
watch(currentWorkplace, (to) => viewer?.setCurrentWorkplaceIndex(to));
watch(showWorkplace, (to) => viewer?.showWorkplace(to));

watch(toolColors, () => updateTools(), { deep: true });

watch(transparencyPercent, (to) => viewer?.setTransparency(to));

watch(progressMode, (to) => viewer?.setProgressMode(to));

// #endregion
</script>
