import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';

const $ = (selector) => document.querySelector(selector);

const els = {
  fileInput: $('#fileInput'),
  dropZone: $('#dropZone'),
  clearAllBtn: $('#clearAllBtn'),
  assetList: $('#assetList'),
  assetCount: $('#assetCount'),
  actionList: $('#actionList'),
  actionCount: $('#actionCount'),
  actionSearch: $('#actionSearch'),
  selectAllActionsBtn: $('#selectAllActionsBtn'),
  deselectEmptyActionsBtn: $('#deselectEmptyActionsBtn'),
  renameCompatibleActionsBtn: $('#renameCompatibleActionsBtn'),
  viewport: $('#viewport'),
  viewportEmpty: $('#viewportEmpty'),
  baseBadge: $('#baseBadge'),
  activeActionBadge: $('#activeActionBadge'),
  playPauseBtn: $('#playPauseBtn'),
  timeline: $('#timeline'),
  currentTime: $('#currentTime'),
  durationTime: $('#durationTime'),
  speedSelect: $('#speedSelect'),
  toggleSkeletonBtn: $('#toggleSkeletonBtn'),
  fitCameraBtn: $('#fitCameraBtn'),
  statusBar: $('#statusBar'),
  statusText: $('#statusText'),
  presetSelect: $('#presetSelect'),
  exportModelName: $('#exportModelName'),
  exportActionCount: $('#exportActionCount'),
  exportFbxBtn: $('#exportFbxBtn'),
  exportGlbBtn: $('#exportGlbBtn'),
  assetTemplate: $('#assetTemplate'),
  actionTemplate: $('#actionTemplate'),
};

const state = {
  assets: [],
  clips: [],
  baseAssetId: null,
  activeClipId: null,
  mixer: null,
  currentAction: null,
  previewClip: null,
  skeletonHelper: null,
  skeletonVisible: false,
  previewStage: null,
  isScrubbing: false,
  exporting: false,
};

const fbxLoader = new FBXLoader();
fbxLoader.trimAnimationClips = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1115);

const previewStage = new THREE.Group();
previewStage.name = '__preview_stage__';
scene.add(previewStage);
state.previewStage = previewStage;

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100000);
camera.position.set(3, 2.4, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
els.viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x20252b, 2.0);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 3.0);
key.position.set(4, 7, 5);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2);
rim.position.set(-4, 3, -5);
scene.add(rim);

const grid = new THREE.GridHelper(20, 20, 0x39414c, 0x222830);
grid.position.y = 0;
scene.add(grid);

const clock = new THREE.Clock();

function uid(prefix = 'id') {
  return crypto.randomUUID ? crypto.randomUUID() : prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function stripExt(name) {
  return name.replace(/\.fbx$/i, '');
}

function formatDuration(seconds) {
  return Number.isFinite(seconds) ? seconds.toFixed(2) + ' s' : '0.00 s';
}

function setStatus(message, kind = 'info') {
  els.statusText.textContent = message;
  els.statusBar.dataset.kind = kind;
}

function getBaseAsset() {
  return state.assets.find((asset) => asset.id === state.baseAssetId) || null;
}

function getIncludedClips() {
  return state.clips.filter((record) => record.include);
}

function isEmptyClip(record) {
  return Boolean(
    record?.empty ||
    !record?.clip ||
    record.clip.tracks.length === 0 ||
    record.clip.duration <= 1e-6
  );
}

function captureRestPose(object) {
  const rest = new Map();
  object.updateMatrixWorld(true);

  object.traverse((node) => {
    if (!node.name) return;

    const worldQuaternion = new THREE.Quaternion();
    node.getWorldQuaternion(worldQuaternion);

    const parentWorldQuaternion = new THREE.Quaternion();
    if (node.parent) node.parent.getWorldQuaternion(parentWorldQuaternion);

    rest.set(node.name, {
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
      worldQuaternion,
      parentWorldQuaternion,
      parentName: node.parent?.name || null,
    });
  });

  return rest;
}

function applyRestPose(object, restPose) {
  if (!restPose) return;

  object.traverse((node) => {
    if (!node.name) return;
    const rest = restPose.get(node.name);
    if (!rest) return;

    node.position.copy(rest.position);
    node.quaternion.copy(rest.quaternion);
    node.scale.copy(rest.scale);
  });

  object.updateMatrixWorld(true);

  object.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) {
      node.skeleton.update();
    }
  });
}

function getAssetUnitScale(asset) {
  const n = Number(asset?.unitScaleFactor);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function retargetPositionTrack(track, sourceRest, baseRest, unitRatio) {
  if (!sourceRest || !baseRest) return;

  const values = track.values;
  const sourceParentWorld = sourceRest.parentWorldQuaternion || new THREE.Quaternion();
  const baseParentWorldInv = (baseRest.parentWorldQuaternion || new THREE.Quaternion()).clone().invert();

  const v = new THREE.Vector3();
  for (let i = 0; i < values.length; i += 3) {
    v.set(
      values[i] - sourceRest.position.x,
      values[i + 1] - sourceRest.position.y,
      values[i + 2] - sourceRest.position.z
    );

    // Convert the local translation delta through each rig's rest-space parent axes.
    v.applyQuaternion(sourceParentWorld)
      .multiplyScalar(unitRatio)
      .applyQuaternion(baseParentWorldInv);

    values[i] = baseRest.position.x + v.x;
    values[i + 1] = baseRest.position.y + v.y;
    values[i + 2] = baseRest.position.z + v.z;
  }
}

function findPrimarySkinnedMesh(object) {
  let primary = null;
  object.traverse((node) => {
    if (!primary && node.isSkinnedMesh && node.skeleton?.bones?.length) {
      primary = node;
    }
  });
  return primary;
}

function findHipBoneName(skinnedMesh) {
  const bones = skinnedMesh?.skeleton?.bones || [];
  const exact = bones.find((bone) => /(^|[:_])hips?$/i.test(bone.name));
  if (exact) return exact.name;

  const loose = bones.find((bone) => /hips?/i.test(bone.name));
  return loose?.name || bones[0]?.name || 'hip';
}

function extractRetargetedQuaternionTracks(record, baseAsset) {
  const sourceAsset = state.assets.find((asset) => asset.id === record.sourceId) || null;
  if (!sourceAsset || !baseAsset) return null;

  // Do the matrix-based retarget on isolated clones. This avoids touching
  // either the source FBX or the live preview/model base.
  const sourceRoot = SkeletonUtils.clone(sourceAsset.object);
  const targetRoot = SkeletonUtils.clone(baseAsset.object);

  applyRestPose(sourceRoot, sourceAsset.restPose);
  applyRestPose(targetRoot, baseAsset.restPose);

  const sourceSkin = findPrimarySkinnedMesh(sourceRoot);
  const targetSkin = findPrimarySkinnedMesh(targetRoot);
  if (!sourceSkin || !targetSkin) return null;

  sourceRoot.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);

  const hipName = findHipBoneName(targetSkin);

  let retargeted;
  try {
    retargeted = SkeletonUtils.retargetClip(
      targetSkin,
      sourceSkin,
      record.clip.clone(),
      {
        getBoneName: (bone) => bone.name,
        hip: hipName,
        preserveBonePositions: true,
        preserveBoneMatrix: true,
        useTargetMatrix: false,
        hipInfluence: new THREE.Vector3(1, 1, 1),
        // Position/root scale is already handled by our translation retarget.
        // This clip is used only as the authoritative rotation source.
        scale: 1,
      }
    );
  } catch (error) {
    console.warn('Retarget jerárquico de rotación falló; usando fallback local.', record.sourceFile, error);
    return null;
  }

  const byBone = new Map();

  for (const track of retargeted.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;

    let boneName = '';
    const bonesMatch = track.name.match(/\.bones\[([^\]]+)\]\.quaternion$/);
    if (bonesMatch) {
      boneName = bonesMatch[1];
    } else {
      try {
        boneName = THREE.PropertyBinding.parseTrackName(track.name).nodeName || '';
      } catch {
        boneName = '';
      }
    }

    if (!boneName) continue;

    byBone.set(boneName, new THREE.QuaternionKeyframeTrack(
      boneName + '.quaternion',
      track.times.slice(),
      track.values.slice()
    ));
  }

  return byBone.size ? byBone : null;
}

function replaceQuaternionTracksWithHierarchicalRetarget(record, baseAsset, clip) {
  const rotationTracks = extractRetargetedQuaternionTracks(record, baseAsset);
  if (!rotationTracks) return false;

  clip.tracks = clip.tracks.map((track) => {
    let parsed;
    try {
      parsed = THREE.PropertyBinding.parseTrackName(track.name);
    } catch {
      return track;
    }

    if (parsed.propertyName !== 'quaternion') return track;

    const replacement = rotationTracks.get(parsed.nodeName);
    return replacement ? replacement.clone() : track;
  });

  return true;
}

function retargetQuaternionTrack(track, sourceRest, baseRest) {
  if (!sourceRest || !baseRest) return;

  const values = track.values;
  const sourceRestInv = sourceRest.quaternion.clone().invert();
  const qAnim = new THREE.Quaternion();
  const qDelta = new THREE.Quaternion();
  const qOut = new THREE.Quaternion();

  for (let i = 0; i < values.length; i += 4) {
    qAnim.set(values[i], values[i + 1], values[i + 2], values[i + 3]).normalize();
    qDelta.copy(sourceRestInv).multiply(qAnim).normalize();
    qOut.copy(baseRest.quaternion).multiply(qDelta).normalize();

    values[i] = qOut.x;
    values[i + 1] = qOut.y;
    values[i + 2] = qOut.z;
    values[i + 3] = qOut.w;
  }
}

function retargetScaleTrack(track, sourceRest, baseRest) {
  if (!sourceRest || !baseRest) return;

  const values = track.values;
  for (let i = 0; i < values.length; i += 3) {
    const sx = Math.abs(sourceRest.scale.x) > 1e-8 ? sourceRest.scale.x : 1;
    const sy = Math.abs(sourceRest.scale.y) > 1e-8 ? sourceRest.scale.y : 1;
    const sz = Math.abs(sourceRest.scale.z) > 1e-8 ? sourceRest.scale.z : 1;

    values[i] = baseRest.scale.x * (values[i] / sx);
    values[i + 1] = baseRest.scale.y * (values[i + 1] / sy);
    values[i + 2] = baseRest.scale.z * (values[i + 2] / sz);
  }
}

function countBones(object) {
  let n = 0;
  object.traverse((node) => { if (node.isBone) n += 1; });
  return n;
}

function countSkinnedMeshes(object) {
  let n = 0;
  object.traverse((node) => { if (node.isSkinnedMesh) n += 1; });
  return n;
}

function collectNodeNames(object) {
  const names = new Set();
  object.traverse((node) => {
    if (node.name) names.add(node.name);
  });
  if (object.name) names.add(object.name);
  return names;
}

function getTrackNodeName(trackName) {
  try {
    return THREE.PropertyBinding.parseTrackName(trackName).nodeName || '';
  } catch {
    const dot = trackName.indexOf('.');
    return dot >= 0 ? trackName.slice(0, dot) : trackName;
  }
}

function compatibility(record, baseAsset) {
  if (!baseAsset) return { ratio: 0, matched: 0, total: 0, label: 'Sin base', className: 'warn' };
  const names = baseAsset.nodeNames;
  const sourceRoot = record.sourceRootName;
  let matched = 0;
  let total = 0;

  for (const track of record.clip.tracks) {
    const target = getTrackNodeName(track.name);
    if (!target) continue;
    total += 1;
    if (names.has(target) || (sourceRoot && target === sourceRoot && baseAsset.object.name)) matched += 1;
  }

  if (!total) return { ratio: 1, matched: 0, total: 0, label: 'Sin tracks', className: 'warn' };
  const ratio = matched / total;
  const pct = Math.round(ratio * 100);
  return {
    ratio,
    matched,
    total,
    label: pct + '% compatible',
    className: ratio >= 0.98 ? 'good' : ratio >= 0.7 ? 'warn' : 'bad',
  };
}

function isFullyCompatible(record, baseAsset = getBaseAsset()) {
  if (!baseAsset || isEmptyClip(record)) return false;
  const result = compatibility(record, baseAsset);
  return result.total > 0 && result.matched === result.total;
}

function getFullyCompatibleClips(baseAsset = getBaseAsset()) {
  if (!baseAsset) return [];
  return state.clips.filter((record) => isFullyCompatible(record, baseAsset));
}

function sourceFileToActionName(sourceFile) {
  return stripExt(sourceFile)
    .trim()
    .replace(/\s+/g, '_');
}

function makeClipForBase(record, baseAsset, usedNames = null) {
  const clip = record.clip.clone();
  let exportName = (record.name || record.clip?.name || record.originalName || 'Action').trim() || 'Action';

  if (usedNames) {
    const rootName = exportName;
    let i = 2;
    while (usedNames.has(exportName.toLowerCase())) exportName = rootName + '_' + i++;
    usedNames.add(exportName.toLowerCase());
  }

  clip.name = exportName;

  const sourceAsset = state.assets.find((asset) => asset.id === record.sourceId) || null;
  const sourceRestPose = sourceAsset?.restPose;
  const baseRestPose = baseAsset?.restPose;
  const unitRatio = getAssetUnitScale(sourceAsset) / getAssetUnitScale(baseAsset);

  for (const track of clip.tracks) {
    let parsed;
    try {
      parsed = THREE.PropertyBinding.parseTrackName(track.name);
    } catch {
      continue;
    }

    const sourceNodeName = parsed.nodeName || '';
    let targetNodeName = sourceNodeName;

    if (
      record.sourceRootName &&
      baseAsset.object.name &&
      sourceNodeName === record.sourceRootName &&
      record.sourceRootName !== baseAsset.object.name
    ) {
      targetNodeName = baseAsset.object.name;
      const suffix = track.name.slice(record.sourceRootName.length);
      track.name = baseAsset.object.name + suffix;
    }

    const sourceRest = sourceRestPose?.get(sourceNodeName);
    const baseRest = baseRestPose?.get(targetNodeName);

    if (parsed.propertyName === 'position') {
      retargetPositionTrack(track, sourceRest, baseRest, unitRatio);
    } else if (parsed.propertyName === 'quaternion') {
      // Keep the animation's original local rotation delta relative to its
      // source rest pose, then apply that delta to the base rig rest pose.
      // This is the version that preserved the Mixamo motion correctly.
      retargetQuaternionTrack(track, sourceRest, baseRest);
    } else if (parsed.propertyName === 'scale') {
      retargetScaleTrack(track, sourceRest, baseRest);
    }
  }

  clip.resetDuration();
  return clip;
}

function normalizePreview(object) {
  previewStage.position.set(0, 0, 0);
  previewStage.rotation.set(0, 0, 0);
  previewStage.scale.setScalar(1);
  previewStage.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(object, true);
  const finite =
    Number.isFinite(box.min.x) && Number.isFinite(box.min.y) && Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) && Number.isFinite(box.max.y) && Number.isFinite(box.max.z);

  if (box.isEmpty() || !finite) {
    setStatus('El FBX cargó, pero no se pudo calcular su volumen visual. Intentando vista de respaldo.', 'warn');
    previewStage.position.set(0, 0, 0);
    previewStage.scale.setScalar(1);
    return false;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(maxDim) || maxDim <= 1e-8) {
    setStatus('El FBX no tiene un volumen visible utilizable para auto-encuadre.', 'warn');
    return false;
  }

  // Normalización solo para la vista previa. NO modifica los transforms del FBX exportado.
  const desiredSize = 3.0;
  const scale = THREE.MathUtils.clamp(desiredSize / maxDim, 1e-6, 1e6);
  previewStage.scale.setScalar(scale);
  previewStage.position.set(
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale
  );
  previewStage.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  return true;
}

function renderAssets() {
  els.assetCount.textContent = String(state.assets.length);
  els.assetList.innerHTML = '';
  els.assetList.classList.toggle('empty-list', state.assets.length === 0);

  if (!state.assets.length) {
    els.assetList.innerHTML = '<p>Importa FBX para elegir cuál conservará la malla y el esqueleto.</p>';
    return;
  }

  for (const asset of state.assets) {
    const node = els.assetTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.assetId = asset.id;
    node.classList.toggle('active', asset.id === state.baseAssetId);

    const radio = node.querySelector('.base-radio');
    radio.value = asset.id;
    radio.checked = asset.id === state.baseAssetId;
    radio.addEventListener('change', () => setBaseAsset(asset.id));

    node.querySelector('.asset-name').textContent = asset.file.name;
    node.querySelector('.asset-meta').textContent =
      asset.clips.length + ' action' + (asset.clips.length === 1 ? '' : 's') +
      ' · ' + asset.boneCount + ' huesos · ' + asset.skinnedMeshCount + ' skin';

    node.querySelector('.asset-remove').addEventListener('click', () => removeAsset(asset.id));
    els.assetList.appendChild(node);
  }
}

function renderActions() {
  const query = els.actionSearch.value.trim().toLowerCase();
  const base = getBaseAsset();
  const filtered = state.clips.filter((record) => {
    if (!query) return true;
    return record.name.toLowerCase().includes(query) || record.sourceFile.toLowerCase().includes(query);
  });

  // Dos grupos físicos: las actions útiles SIEMPRE primero; las vacías SIEMPRE al final.
  const usefulActions = filtered.filter((record) => !isEmptyClip(record));
  const emptyActions = filtered.filter((record) => isEmptyClip(record));
  const visible = [...usefulActions, ...emptyActions];

  const compatibleCount = getFullyCompatibleClips(base).length;
  els.actionCount.textContent = String(compatibleCount);
  els.actionCount.title = compatibleCount + ' action' + (compatibleCount === 1 ? '' : 's') + ' 100% compatible' + (compatibleCount === 1 ? '' : 's');
  els.actionList.innerHTML = '';
  els.actionList.classList.toggle('empty-list', visible.length === 0);

  if (!visible.length) {
    els.actionList.innerHTML = state.clips.length
      ? '<p>No hay actions que coincidan con la búsqueda.</p>'
      : '<p>Las animaciones encontradas aparecerán aquí. Puedes cambiarles el nombre y reproducirlas sobre el modelo base.</p>';
    updateExportState();
    return;
  }

  let emptyDividerInserted = false;

  for (const record of visible) {
    const empty = isEmptyClip(record);

    if (empty && !emptyDividerInserted) {
      const divider = document.createElement('div');
      divider.className = 'action-group-divider';
      divider.innerHTML =
        '<span>Sin tracks</span><span>' + emptyActions.length + '</span>';
      els.actionList.appendChild(divider);
      emptyDividerInserted = true;
    }

    const node = els.actionTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.clipId = record.id;
    node.classList.toggle('active', record.id === state.activeClipId);
    node.classList.toggle('empty-action', empty);

    const playButton = node.querySelector('.action-play');
    playButton.disabled = empty;
    playButton.title = empty ? 'Esta action no contiene tracks' : 'Reproducir';
    playButton.addEventListener('click', () => playClip(record.id));

    const nameInput = node.querySelector('.action-name');
    const renameButton = node.querySelector('.action-rename');
    nameInput.value = record.name;
    nameInput.readOnly = true;

    let originalEditValue = record.name;

    const saveRename = () => {
      record.name = nameInput.value.trim() || record.originalName || 'Action';
      record.clip.name = record.name;
      nameInput.value = record.name;
      nameInput.readOnly = true;
      node.classList.remove('editing');
      renameButton.textContent = 'Renombrar';
      if (record.id === state.activeClipId) {
        els.activeActionBadge.textContent = record.name;
      }
      setStatus('Action renombrada a "' + record.name + '".', 'ok');
      updateExportState();
    };

    const cancelRename = () => {
      nameInput.value = originalEditValue;
      nameInput.readOnly = true;
      node.classList.remove('editing');
      renameButton.textContent = 'Renombrar';
    };

    renameButton.addEventListener('click', () => {
      if (!nameInput.readOnly) {
        saveRename();
        return;
      }

      originalEditValue = record.name;
      nameInput.readOnly = false;
      node.classList.add('editing');
      renameButton.textContent = 'Guardar';
      nameInput.focus();
      nameInput.select();
    });

    nameInput.addEventListener('input', (event) => {
      if (record.id === state.activeClipId) {
        els.activeActionBadge.textContent = event.target.value || 'Action';
      }
    });

    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveRename();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelRename();
      }
    });

    nameInput.addEventListener('dblclick', () => {
      if (nameInput.readOnly) renameButton.click();
    });

    node.querySelector('.action-origin').textContent = record.sourceFile;
    const include = node.querySelector('.action-include');
    include.checked = record.include;
    include.addEventListener('change', () => {
      record.include = include.checked;
      updateExportState();
    });

    node.querySelector('.duration-chip').textContent = formatDuration(record.clip.duration);
    node.querySelector('.tracks-chip').textContent = record.clip.tracks.length + ' tracks';

    const compat = compatibility(record, base);
    const compatEl = node.querySelector('.compat-chip');
    compatEl.textContent = compat.label;
    compatEl.classList.add(compat.className);

    els.actionList.appendChild(node);
  }
  updateExportState();
}

function updateExportState() {
  const base = getBaseAsset();
  const included = getIncludedClips();
  const canExport = Boolean(base && included.length && !state.exporting);
  els.exportModelName.textContent = base ? base.file.name : '—';
  els.exportActionCount.textContent = String(included.length);
  els.exportFbxBtn.disabled = !canExport;
  els.exportGlbBtn.disabled = !canExport;
}

function resetPlaybackUi() {
  state.activeClipId = null;
  state.currentAction = null;
  state.previewClip = null;
  els.activeActionBadge.textContent = 'Sin acción';
  els.playPauseBtn.textContent = '▶';
  els.playPauseBtn.disabled = true;
  els.timeline.disabled = true;
  els.timeline.value = '0';
  els.timeline.max = '1';
  els.currentTime.textContent = '0.00 s';
  els.durationTime.textContent = '0.00 s';
}

function disposeMixer() {
  if (state.mixer) {
    state.mixer.stopAllAction();
    const base = getBaseAsset();
    if (base) state.mixer.uncacheRoot(base.object);
  }
  state.mixer = null;
  state.currentAction = null;
  state.previewClip = null;
}

function setBaseAsset(assetId) {
  const next = state.assets.find((asset) => asset.id === assetId);
  if (!next) return;

  const oldBase = getBaseAsset();
  if (oldBase && oldBase.object.parent === previewStage) previewStage.remove(oldBase.object);
  if (state.skeletonHelper) {
    scene.remove(state.skeletonHelper);
    state.skeletonHelper.dispose?.();
    state.skeletonHelper = null;
  }

  disposeMixer();
  state.baseAssetId = next.id;
  previewStage.add(next.object);
  normalizePreview(next.object);
  state.mixer = new THREE.AnimationMixer(next.object);

  state.skeletonHelper = new THREE.SkeletonHelper(next.object);
  state.skeletonHelper.visible = state.skeletonVisible;
  scene.add(state.skeletonHelper);

  els.viewportEmpty.classList.add('hidden');
  els.baseBadge.textContent = next.file.name;
  els.toggleSkeletonBtn.disabled = false;
  els.fitCameraBtn.disabled = false;
  resetPlaybackUi();
  fitCameraToObject(next.object);
  renderAssets();
  renderActions();

  const actionTotal = state.clips.length;
  setStatus('Modelo base: ' + next.file.name + '. Hay ' + actionTotal + ' action' + (actionTotal === 1 ? '' : 's') + ' disponibles.', 'ok');
}

function removeAsset(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;

  if (state.baseAssetId === assetId) {
    if (asset.object.parent === previewStage) previewStage.remove(asset.object);
    disposeMixer();
    state.baseAssetId = null;
    if (state.skeletonHelper) {
      scene.remove(state.skeletonHelper);
      state.skeletonHelper.dispose?.();
      state.skeletonHelper = null;
    }
    resetPlaybackUi();
  }

  state.assets = state.assets.filter((item) => item.id !== assetId);
  state.clips = state.clips.filter((record) => record.sourceId !== assetId);

  if (!state.baseAssetId && state.assets.length) setBaseAsset(state.assets[0].id);
  else {
    renderAssets();
    renderActions();
    updateViewportEmpty();
  }

  setStatus('Se quitó ' + asset.file.name + '.', 'info');
}

function updateViewportEmpty() {
  const base = getBaseAsset();
  els.viewportEmpty.classList.toggle('hidden', Boolean(base));
  els.baseBadge.textContent = base ? base.file.name : 'Sin modelo base';
  els.toggleSkeletonBtn.disabled = !base;
  els.fitCameraBtn.disabled = !base;
  updateExportState();
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter((file) => /\.fbx$/i.test(file.name));
  if (!files.length) {
    setStatus('Selecciona uno o más archivos .fbx.', 'warn');
    return;
  }

  els.fileInput.disabled = true;
  setStatus('Leyendo ' + files.length + ' FBX...', 'info');
  let imported = 0;
  let failed = 0;

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    try {
      setStatus('Procesando ' + (index + 1) + '/' + files.length + ': ' + file.name, 'info');
      const buffer = await file.arrayBuffer();
      const object = fbxLoader.parse(buffer, '');
      if (!object.name) object.name = stripExt(file.name);

      object.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      const rawClips = Array.isArray(object.animations) ? object.animations : [];
      const assetId = uid('asset');
      const assetClips = [];

      rawClips.forEach((clip, clipIndex) => {
        const cloned = clip.clone();
        const originalName = (cloned.name || '').trim() || stripExt(file.name) + '_Action_' + (clipIndex + 1);
        const isEmpty = cloned.tracks.length === 0 || cloned.duration <= 1e-6;

        // El nombre editable empieza SIEMPRE con el nombre interno real del AnimationClip.
        cloned.name = originalName;

        const record = {
          id: uid('clip'),
          sourceId: assetId,
          sourceFile: file.name,
          sourceRootName: object.name || '',
          originalName,
          name: originalName,
          clip: cloned,
          empty: isEmpty,
          include: !isEmpty,
        };
        state.clips.push(record);
        assetClips.push(record.id);
      });

      state.assets.push({
        id: assetId,
        file,
        object,
        clips: assetClips,
        boneCount: countBones(object),
        skinnedMeshCount: countSkinnedMeshes(object),
        nodeNames: collectNodeNames(object),
        restPose: captureRestPose(object),
        unitScaleFactor: Number(object.userData?.unitScaleFactor) || 1,
      });

      imported += 1;
    } catch (error) {
      failed += 1;
      console.error('Error importando FBX', file.name, error);
      setStatus('No se pudo leer ' + file.name + ': ' + (error?.message || error), 'error');
    }
  }

  els.fileInput.disabled = false;
  els.fileInput.value = '';

  if (!state.baseAssetId && state.assets.length) {
    setBaseAsset(state.assets[0].id);
  } else {
    renderAssets();
    renderActions();
    updateViewportEmpty();
  }

  const actionTotal = state.clips.length;
  const usefulTotal = state.clips.filter((record) => !isEmptyClip(record)).length;
  if (imported) {
    setStatus(
      'Importados ' + imported + ' FBX · ' + actionTotal + ' actions detectadas · ' + usefulTotal + ' útiles para reproducir/exportar' +
      (failed ? ' · ' + failed + ' archivo(s) fallaron.' : '.'),
      failed ? 'warn' : 'ok'
    );
  }
}

function playClip(clipId) {
  const base = getBaseAsset();
  const record = state.clips.find((item) => item.id === clipId);
  if (!base || !record || !state.mixer) {
    setStatus('Elige un modelo base antes de reproducir una action.', 'warn');
    return;
  }

  if (isEmptyClip(record)) {
    setStatus('"' + record.name + '" está vacía: no contiene tracks de animación reproducibles.', 'warn');
    return;
  }

  state.mixer.stopAllAction();
  state.mixer.setTime(0);

  const clip = makeClipForBase(record, base);
  const action = state.mixer.clipAction(clip, base.object);
  action.reset();
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = false;
  action.paused = false;
  action.play();

  state.activeClipId = record.id;
  state.currentAction = action;
  state.previewClip = clip;

  els.activeActionBadge.textContent = record.name;
  els.playPauseBtn.disabled = false;
  els.playPauseBtn.textContent = 'Ⅱ';
  els.timeline.disabled = false;
  els.timeline.min = '0';
  els.timeline.max = String(Math.max(clip.duration, 0.001));
  els.timeline.value = '0';
  els.currentTime.textContent = '0.00 s';
  els.durationTime.textContent = formatDuration(clip.duration);

  renderActions();

  const compat = compatibility(record, base);
  if (compat.ratio < 0.7) {
    setStatus('La action "' + record.name + '" solo coincide con ' + Math.round(compat.ratio * 100) + '% de sus tracks en este rig.', 'warn');
  } else {
    setStatus('Reproduciendo "' + record.name + '" sobre ' + base.file.name + '.', 'ok');
  }
}

function fitCameraToObject(object) {
  previewStage.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object, true);
  const finite =
    Number.isFinite(box.min.x) && Number.isFinite(box.min.y) && Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) && Number.isFinite(box.max.y) && Number.isFinite(box.max.z);

  if (box.isEmpty() || !finite) {
    camera.position.set(0, 1.5, 5);
    controls.target.set(0, 1.5, 0);
    camera.near = 0.001;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(camera.aspect || 1, 0.05);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);

  const fitHeight = size.y / (2 * Math.tan(verticalFov / 2));
  const fitWidth = size.x / (2 * Math.tan(horizontalFov / 2));
  const fitDepth = size.z * 0.65;
  const distance = Math.max(fitHeight, fitWidth, 1.5) * 1.28 + fitDepth;

  // Vista ligeramente en perspectiva, manteniendo el personaje completo dentro del frame.
  const direction = new THREE.Vector3(0.32, 0.12, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 1000, 0.001);
  camera.far = Math.max(distance * 100, 1000);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = Math.max(distance * 0.08, 0.05);
  controls.maxDistance = distance * 12;
  controls.update();

  grid.position.y = 0;
  grid.scale.setScalar(1);
}

function restoreBasePose() {
  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer.setTime(0);
  }

  const base = getBaseAsset();
  if (!base) return;

  applyRestPose(base.object, base.restPose);
}

function buildExportClips(base) {
  const usedNames = new Set();
  return getIncludedClips().map((record) => makeClipForBase(record, base, usedNames));
}

function buildCleanExportRoot(base, clips) {
  restoreBasePose();

  const exportRoot = SkeletonUtils.clone(base.object);
  applyRestPose(exportRoot, base.restPose);
  exportRoot.animations = clips;

  exportRoot.traverse((node) => {
    // Preview-only helpers must never leak into the file.
    if (node.userData?.__previewOnly) node.visible = false;
  });

  exportRoot.updateMatrixWorld(true);
  return exportRoot;
}

function applyFbxArmatureOrientationFix(exportRoot, preset) {
  // Corrección global del objeto raíz solamente. Nunca modifica las curvas
  // internas de los huesos ni las Actions.
  //
  // 1) Corrección Z confirmada visualmente por el usuario:
  //    el FBX anterior importaba el armature con 180° en Z.
  const zCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI
  );
  exportRoot.quaternion.premultiply(zCorrection);

  // 2) Blender importa este FBX con X=-90°. El FBX original de referencia
  //    queda en X=+90°. La diferencia exacta es 180° sobre X.
  //    Esto se aplica SOLO al preset Blender; Unity conserva su orientación
  //    hasta validarla directamente dentro de Unity.
  if (preset === 'blender') {
    const xCorrection = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI
    );
    exportRoot.quaternion.premultiply(xCorrection);
  }

  exportRoot.updateMatrix();
  exportRoot.updateMatrixWorld(true);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportFBX() {
  const base = getBaseAsset();
  if (!base || state.exporting) return;

  const clips = buildExportClips(base);
  if (!clips.length) return;

  state.exporting = true;
  updateExportState();
  setStatus('Generando FBX corregido con ' + clips.length + ' actions...', 'info');

  try {
    const exportRoot = buildCleanExportRoot(base, clips);
    const preset = els.presetSelect.value;
    applyFbxArmatureOrientationFix(exportRoot, preset);
    const exporter = new FBXExporter();

    // FBXLoader conserva las unidades numéricas del archivo de origen.
    // Por eso NO debemos imponer UnitScale=100 al preset Blender: eso vuelve
    // a escalar malla, bind pose y traslaciones de animación de forma distinta.
    const sourceUnitScale = getAssetUnitScale(base);

    const bytes = await exporter.parseAsync(exportRoot, {
      preset,
      unitScale: sourceUnitScale,
      animations: clips,
      includeAnimations: true,
      embedTextures: true,
      bakeSpaceTransform: false,
      fps: 30,
    });

    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const filename = stripExt(base.file.name) + '_all_actions.fbx';
    downloadBlob(blob, filename);

    setStatus(
      'FBX exportado con retarget de rest pose, orientación de root corregida y unidad preservada (' +
      sourceUnitScale + '): ' + filename + ' · ' + clips.length + ' actions.',
      'ok'
    );
  } catch (error) {
    console.error(error);
    setStatus('Error al exportar FBX: ' + (error?.message || error), 'error');
  } finally {
    restoreBasePose();
    state.exporting = false;
    updateExportState();
  }
}

async function exportGLB() {
  const base = getBaseAsset();
  if (!base || state.exporting) return;

  const clips = buildExportClips(base);
  if (!clips.length) return;

  state.exporting = true;
  updateExportState();
  setStatus('Generando GLB de respaldo...', 'info');

  try {
    const exportRoot = buildCleanExportRoot(base, clips);
    const exporter = new GLTFExporter();

    const result = await exporter.parseAsync(exportRoot, {
      binary: true,
      animations: clips,
      trs: true,
      onlyVisible: false,
      maxTextureSize: 4096,
    });

    const filename = stripExt(base.file.name) + '_all_actions.glb';
    downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), filename);
    setStatus('GLB exportado con el mismo retarget de rest pose: ' + filename + ' · ' + clips.length + ' actions.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus('Error al exportar GLB: ' + (error?.message || error), 'error');
  } finally {
    restoreBasePose();
    state.exporting = false;
    updateExportState();
  }
}

function clearAll() {
  const base = getBaseAsset();
  if (base && base.object.parent === previewStage) previewStage.remove(base.object);
  disposeMixer();
  if (state.skeletonHelper) {
    scene.remove(state.skeletonHelper);
    state.skeletonHelper.dispose?.();
  }

  state.assets = [];
  state.clips = [];
  state.baseAssetId = null;
  state.activeClipId = null;
  state.skeletonHelper = null;

  resetPlaybackUi();
  renderAssets();
  renderActions();
  updateViewportEmpty();
  setStatus('Proyecto limpio. Puedes importar otro lote de FBX.', 'info');
}

els.fileInput.addEventListener('change', (event) => importFiles(event.target.files));
['dragenter', 'dragover'].forEach((type) => els.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  els.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((type) => els.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  els.dropZone.classList.remove('dragging');
}));
els.dropZone.addEventListener('drop', (event) => importFiles(event.dataTransfer.files));

els.clearAllBtn.addEventListener('click', clearAll);
els.actionSearch.addEventListener('input', renderActions);

els.selectAllActionsBtn.addEventListener('click', () => {
  state.clips.forEach((record) => { record.include = true; });
  renderActions();
  setStatus('Todas las actions quedaron seleccionadas para exportar.', 'ok');
});

els.deselectEmptyActionsBtn.addEventListener('click', () => {
  let changed = 0;
  state.clips.forEach((record) => {
    if (isEmptyClip(record) && record.include) {
      record.include = false;
      changed += 1;
    }
  });
  renderActions();
  setStatus(
    changed
      ? 'Se desmarcaron ' + changed + ' action' + (changed === 1 ? '' : 's') + ' sin tracks.'
      : 'No había actions sin tracks seleccionadas.',
    changed ? 'ok' : 'info'
  );
});

els.renameCompatibleActionsBtn.addEventListener('click', () => {
  const base = getBaseAsset();
  if (!base) {
    setStatus('Selecciona primero un modelo base.', 'warn');
    return;
  }

  const compatible = getFullyCompatibleClips(base);
  if (!compatible.length) {
    setStatus('No hay Actions 100% compatibles para renombrar.', 'warn');
    return;
  }

  compatible.forEach((record) => {
    const nextName = sourceFileToActionName(record.sourceFile) || record.name || record.originalName || 'Action';
    record.name = nextName;
    record.clip.name = nextName;
  });

  const active = state.clips.find((record) => record.id === state.activeClipId);
  if (active) {
    els.activeActionBadge.textContent = active.name;
  }

  renderActions();
  setStatus(
    'Renombradas ' + compatible.length + ' Actions 100% compatibles usando el nombre de su FBX.',
    'ok'
  );
});
els.fitCameraBtn.addEventListener('click', () => {
  const base = getBaseAsset();
  if (base) {
    normalizePreview(base.object);
    fitCameraToObject(base.object);
    setStatus('Vista previa reencuadrada.', 'ok');
  }
});
els.toggleSkeletonBtn.addEventListener('click', () => {
  state.skeletonVisible = !state.skeletonVisible;
  if (state.skeletonHelper) state.skeletonHelper.visible = state.skeletonVisible;
  els.toggleSkeletonBtn.textContent = state.skeletonVisible ? 'Ocultar huesos' : 'Esqueleto';
});
els.playPauseBtn.addEventListener('click', () => {
  if (!state.currentAction) return;
  state.currentAction.paused = !state.currentAction.paused;
  els.playPauseBtn.textContent = state.currentAction.paused ? '▶' : 'Ⅱ';
});
els.speedSelect.addEventListener('change', () => {
  if (state.mixer) state.mixer.timeScale = Number(els.speedSelect.value);
});
els.timeline.addEventListener('pointerdown', () => { state.isScrubbing = true; });
window.addEventListener('pointerup', () => { state.isScrubbing = false; });
els.timeline.addEventListener('input', () => {
  if (!state.mixer || !state.previewClip) return;
  const time = Number(els.timeline.value);
  state.mixer.setTime(time);
  els.currentTime.textContent = formatDuration(time);
});
els.exportFbxBtn.addEventListener('click', exportFBX);
els.exportGlbBtn.addEventListener('click', exportGLB);

let lastViewportAspect = 0;

function resize() {
  const width = Math.max(1, els.viewport.clientWidth);
  const height = Math.max(1, els.viewport.clientHeight);
  const nextAspect = width / height;

  renderer.setSize(width, height, false);
  camera.aspect = nextAspect;
  camera.updateProjectionMatrix();

  const base = getBaseAsset();
  if (base && Math.abs(nextAspect - lastViewportAspect) > 0.08) {
    requestAnimationFrame(() => fitCameraToObject(base.object));
  }
  lastViewportAspect = nextAspect;
}
new ResizeObserver(resize).observe(els.viewport);
resize();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.mixer) state.mixer.update(delta);
  controls.update();

  if (state.currentAction && state.previewClip && !state.isScrubbing) {
    const duration = Math.max(state.previewClip.duration, 0.001);
    const time = ((state.currentAction.time % duration) + duration) % duration;
    els.timeline.value = String(time);
    els.currentTime.textContent = formatDuration(time);
  }

  renderer.render(scene, camera);
}
animate();

renderAssets();
renderActions();
updateViewportEmpty();
