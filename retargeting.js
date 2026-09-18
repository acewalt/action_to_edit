import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const BLENDCAP_STANDARD_PRESETS = [
  {
    id: 'blendcap_to_rigify_new',
    label: 'BlendCap → Rigify (New)',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/blendcap_to_rigify_new.json',
  },
  {
    id: 'blendcap_to_rigify_old',
    label: 'BlendCap → Rigify (Old)',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/blendcap_to_rigify_old.json',
  },
  {
    id: 'blendcap_to_arp',
    label: 'BlendCap → Auto-Rig Pro',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/blendcap_to_arp.json',
  },
  {
    id: 'blendcap_to_cloudrig',
    label: 'BlendCap → CloudRig',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/blendcap_to_cloudrig.json',
  },
  {
    id: 'blendcap_to_mixamo',
    label: 'BlendCap → Mixamo',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/blendcap_to_mixamo.json',
  },
  {
    id: 'blendcap_to_mixamo_ctrl',
    label: 'BlendCap → Mixamo Control Rig',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/blendcap_to_mixamo_ctrl.json',
  },
  {
    id: 'mixamo_to_arp',
    label: 'Mixamo → Auto-Rig Pro',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/mixamo_to_arp.json',
  },
  {
    id: 'mixamo_to_cloudrig',
    label: 'Mixamo → CloudRig',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/mixamo_to_cloudrig.json',
  },
  {
    id: 'mixamo_to_mixamo_ctrl',
    label: 'Mixamo → Mixamo Control Rig',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/mixamo_to_mixamo_ctrl.json',
  },
  {
    id: 'mixamo_to_rigify',
    label: 'Mixamo → Rigify',
    url: 'https://raw.githubusercontent.com/Arcomade/BlendCap/main/retarget_maps/blendcap_standard/mixamo_to_rigify.json',
  },
];

export async function fetchBlendCapPreset(id) {
  const entry = BLENDCAP_STANDARD_PRESETS.find((item) => item.id === id);
  if (!entry) throw new Error('Preset BlendCap desconocido: ' + id);

  const response = await fetch(entry.url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('No se pudo cargar el preset (' + response.status + ').');
  }

  const data = await response.json();
  return normalizePresetData(data, entry.label);
}

export function normalizePresetData(data, fallbackName = 'Preset') {
  const pairs = Array.isArray(data?.pairs)
    ? data.pairs.map((pair) => normalizePair(pair))
    : [];

  return {
    name: String(data?.name || fallbackName || 'Preset'),
    version: Number(data?.version) || 1,
    target_kind: String(data?.target_kind || 'generic'),
    source_prefix: String(data?.source_prefix || ''),
    target_prefix: String(data?.namespace_strip || data?.target_prefix || ''),
    auto_bake_ik: Boolean(data?.auto_bake_ik),
    use_world_location: Boolean(data?.use_world_location),
    face_head_source: String(data?.face_head_source || ''),
    face_head_target: String(data?.face_head_target || ''),
    pairs,
    ik_chains: Array.isArray(data?.ik_chains)
      ? data.ik_chains.map((row) => ({
          limb_kind: String(row?.limb_kind || ''),
          side: String(row?.side || ''),
          owner: String(row?.owner || ''),
          ik_control: String(row?.ik_control || ''),
          pole_control: String(row?.pole_control || ''),
        }))
      : [],
    custom_ik_sources: {
      enabled: Boolean(data?.custom_ik_sources?.enabled),
      left_hand: String(data?.custom_ik_sources?.left_hand || ''),
      right_hand: String(data?.custom_ik_sources?.right_hand || ''),
      left_foot: String(data?.custom_ik_sources?.left_foot || ''),
      right_foot: String(data?.custom_ik_sources?.right_foot || ''),
      left_forearm: String(data?.custom_ik_sources?.left_forearm || ''),
      right_forearm: String(data?.custom_ik_sources?.right_forearm || ''),
      left_shin: String(data?.custom_ik_sources?.left_shin || ''),
      right_shin: String(data?.custom_ik_sources?.right_shin || ''),
    },
  };
}

export function normalizePair(pair = {}) {
  const channels = String(pair.channels || 'ROT').toUpperCase();
  return {
    id: pair.id || makeId('pair'),
    source: String(pair.source || ''),
    target: String(pair.target || ''),
    channels: ['ROT', 'LOC', 'LOC_ROT'].includes(channels) ? channels : 'ROT',
    axes: normalizeAxes(pair.axes || 'XYZ'),
    influence: clamp(Number(pair.influence ?? 1), 0, 1),
    anchor: Boolean(pair.anchor) || String(pair.loc_space || '').toUpperCase() === 'HEAD_LOCAL',
    loc_space: String(pair.loc_space || (pair.anchor ? 'HEAD_LOCAL' : 'BASIS')).toUpperCase(),
    loc_scale: Number.isFinite(Number(pair.loc_scale)) ? Number(pair.loc_scale) : 1,
  };
}

export function collectBoneNames(root) {
  const names = [];
  root?.traverse((node) => {
    if (node.isBone && node.name) names.push(node.name);
  });
  return [...new Set(names)];
}

export function resolveBoneName(shortName, boneNames, prefix = '') {
  if (!shortName) return '';
  const set = boneNames instanceof Set ? boneNames : new Set(boneNames || []);

  if (set.has(shortName)) return shortName;

  if (prefix && set.has(prefix + shortName)) {
    return prefix + shortName;
  }

  const normalized = String(shortName).toLowerCase();
  const caseInsensitive = [...set].find((name) => name.toLowerCase() === normalized);
  if (caseInsensitive) return caseInsensitive;

  if (prefix) {
    const withPrefix = (prefix + shortName).toLowerCase();
    const prefixedInsensitive = [...set].find((name) => name.toLowerCase() === withPrefix);
    if (prefixedInsensitive) return prefixedInsensitive;
  }

  // THREE.FBXLoader sanitizes names used for animation binding:
  // "mixamorig1:LeftArm" becomes "mixamorig1LeftArm" and
  // "FK-UpperArm.L" becomes "FK-UpperArmL".
  // Compare their normalized binding names before semantic matching.
  const normalizedExpected = normalizeExactBoneName(shortName);
  if (normalizedExpected) {
    const normalizedCandidate = [...set].find((name) => {
      const stripped = stripPrefix(name, prefix);
      return (
        normalizeExactBoneName(stripped) === normalizedExpected ||
        normalizeExactBoneName(name) === normalizedExpected
      );
    });
    if (normalizedCandidate) return normalizedCandidate;
  }

  // Browser adaptation: Blender presets often point at FK/control bones.
  // FBX exports may rename or omit those controls while keeping an equivalent
  // deform bone. Fall back to a semantic body-role match.
  const wanted = semanticBoneKey(shortName);
  if (wanted) {
    const candidates = [...set].filter((name) =>
      semanticBoneKey(stripPrefix(name, prefix)) === wanted ||
      semanticBoneKey(name) === wanted
    );

    if (candidates.length) {
      candidates.sort((a, b) => {
        const score = (name) => {
          const n = String(name).toLowerCase();
          let value = 0;
          if (/^def[-_:]/.test(n)) value += 30;
          if (/deform/.test(n)) value += 20;
          if (/mch|org|ctrl|control|pole|target|ik[_\-.]/.test(n)) value -= 25;
          if (/twist|tweak|roll/.test(n)) value -= 15;
          return value;
        };
        return score(b) - score(a) || String(a).localeCompare(String(b));
      });
      return candidates[0];
    }
  }

  return '';
}

export function detectPrefix(boneNames, expectedShortNames = [], fallback = '') {
  const set = new Set(boneNames || []);
  const names = [...new Set((expectedShortNames || []).filter(Boolean))];

  const score = (prefix) => {
    let count = 0;
    for (const short of names) {
      if (set.has(short) || set.has(prefix + short)) count += 1;
    }
    return count;
  };

  let best = fallback || '';
  let bestScore = score(best);

  const counts = new Map();
  for (const bone of set) {
    for (const short of names) {
      if (!short || bone === short || !bone.endsWith(short)) continue;
      const prefix = bone.slice(0, bone.length - short.length);
      if (!prefix || !/[:_.-]$/.test(prefix)) continue;
      counts.set(prefix, (counts.get(prefix) || 0) + 1);
    }
  }

  for (const [prefix] of counts) {
    const current = score(prefix);
    if (current > bestScore) {
      best = prefix;
      bestScore = current;
    }
  }

  return best;
}

export function autoMatchPairs(sourceNames, targetNames, sourcePrefix = '', targetPrefix = '') {
  const source = sourceNames || [];
  const target = targetNames || [];
  const targetByExact = new Map();
  const targetBySemantic = new Map();

  for (const name of target) {
    const stripped = stripPrefix(name, targetPrefix);
    const exact = normalizeExactBoneName(stripped);
    const semantic = semanticBoneKey(stripped);

    if (exact && !targetByExact.has(exact)) targetByExact.set(exact, name);
    if (semantic && !targetBySemantic.has(semantic)) targetBySemantic.set(semantic, name);
  }

  const pairs = [];
  const usedTargets = new Set();

  for (const sourceName of source) {
    const strippedSource = stripPrefix(sourceName, sourcePrefix);
    const exact = normalizeExactBoneName(strippedSource);
    const semantic = semanticBoneKey(strippedSource);

    let targetName = targetByExact.get(exact) || '';
    if (!targetName && semantic) targetName = targetBySemantic.get(semantic) || '';
    if (!targetName || usedTargets.has(targetName)) continue;

    usedTargets.add(targetName);
    pairs.push(normalizePair({
      source: smartStoredName(sourceName, sourcePrefix, source),
      target: smartStoredName(targetName, targetPrefix, target),
      channels: shouldTransferLocation(semantic) ? 'LOC_ROT' : 'ROT',
      axes: semantic === 'hips' || semantic === 'root' ? 'XYZ' : 'XYZ',
      influence: 1,
    }));
  }

  return pairs;
}

export function countValidPairs(pairs, sourceNames, targetNames, sourcePrefix = '', targetPrefix = '') {
  const sourceSet = new Set(sourceNames || []);
  const targetSet = new Set(targetNames || []);
  let valid = 0;

  for (const pair of pairs || []) {
    const s = resolveBoneName(pair.source, sourceSet, sourcePrefix);
    const t = resolveBoneName(pair.target, targetSet, targetPrefix);
    if (s && t) valid += 1;
  }

  return valid;
}

export function sortPairsStandard(pairs) {
  const order = [
    'head', 'neck',
    'leftshoulder', 'leftupperarm', 'leftforearm', 'lefthand',
    'leftthumb1', 'leftthumb2', 'leftthumb3',
    'leftindex1', 'leftindex2', 'leftindex3',
    'leftmiddle1', 'leftmiddle2', 'leftmiddle3',
    'leftring1', 'leftring2', 'leftring3',
    'leftpinky1', 'leftpinky2', 'leftpinky3',
    'rightshoulder', 'rightupperarm', 'rightforearm', 'righthand',
    'rightthumb1', 'rightthumb2', 'rightthumb3',
    'rightindex1', 'rightindex2', 'rightindex3',
    'rightmiddle1', 'rightmiddle2', 'rightmiddle3',
    'rightring1', 'rightring2', 'rightring3',
    'rightpinky1', 'rightpinky2', 'rightpinky3',
    'chest', 'spine3', 'spine2', 'spine1', 'spine', 'hips', 'root',
    'leftthigh', 'leftshin', 'leftfoot', 'lefttoe',
    'rightthigh', 'rightshin', 'rightfoot', 'righttoe',
  ];
  const orderMap = new Map(order.map((key, index) => [key, index]));

  return [...(pairs || [])].sort((a, b) => {
    const ak = semanticBoneKey(a.source);
    const bk = semanticBoneKey(b.source);
    const ai = orderMap.has(ak) ? orderMap.get(ak) : 9999;
    const bi = orderMap.has(bk) ? orderMap.get(bk) : 9999;
    if (ai !== bi) return ai - bi;
    return String(a.source || '').localeCompare(String(b.source || ''), undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });
}

export async function buildRetargetClip({
  sourceAsset,
  targetAsset,
  sourceClip,
  pairs,
  sourcePrefix = '',
  targetPrefix = '',
  autoScale = true,
  useWorldLocation = false,
  sampleFps = 30,
  sourceRestMode = 'original',
  sourceRestRotationOnly = true,
  sourceRestOverride = null,
  headSource = '',
  headTarget = '',
  clipName = 'Retargeted',
  onProgress = null,
}) {
  if (!sourceAsset?.object || !targetAsset?.object || !sourceClip) {
    throw new Error('Source, Target y Action son obligatorios.');
  }

  const normalizedPairs = (pairs || []).map(normalizePair);
  if (!normalizedPairs.length) {
    throw new Error('El bone map está vacío.');
  }

  const sourceRoot = SkeletonUtils.clone(sourceAsset.object);
  const targetRoot = SkeletonUtils.clone(targetAsset.object);

  // Mirror Action to Edit's preview hierarchy so identity Action Transform
  // tracks bind cleanly. Non-identity whole-rig offsets are intentionally
  // carried separately by app.js and are NOT injected into every bone.
  const sourceContainer = new THREE.Group();
  sourceContainer.name = '__RetargetSourceContainer__';
  const sourceActionTransform = new THREE.Group();
  sourceActionTransform.name = '__ActionToEdit_ActionTransform__';
  sourceContainer.add(sourceActionTransform);
  sourceActionTransform.add(sourceRoot);

  applyRestPose(sourceRoot, sourceAsset.restPose);
  applyRestPose(targetRoot, targetAsset.restPose);

  sourceContainer.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);

  const sourceBones = boneMap(sourceRoot);
  const targetBones = boneMap(targetRoot);
  const sourceNames = [...sourceBones.keys()];
  const targetNames = [...targetBones.keys()];

  const invalid = [];
  const runtimePairs = [];

  for (const pair of normalizedPairs) {
    const sourceName = resolveBoneName(pair.source, sourceNames, sourcePrefix);
    const targetName = resolveBoneName(pair.target, targetNames, targetPrefix);

    if (!sourceName || !targetName) {
      invalid.push({
        pair,
        sourceResolved: sourceName,
        targetResolved: targetName,
      });
      continue;
    }

    runtimePairs.push({
      ...pair,
      sourceName,
      targetName,
      sourceBone: sourceBones.get(sourceName),
      targetBone: targetBones.get(targetName),
    });
  }

  if (!runtimePairs.length) {
    throw new Error('Ningún par del bone map coincide con ambos rigs.');
  }

  const preparedClip = sourceClip.clone();
  preparedClip.resetDuration();

  const sourceMixer = new THREE.AnimationMixer(sourceContainer);
  const sourceAction = sourceMixer.clipAction(preparedClip, sourceContainer);
  sourceAction.enabled = true;
  sourceAction.setLoop(THREE.LoopOnce, 0);
  sourceAction.clampWhenFinished = true;
  sourceAction.play();

  const originalSourceRest = captureBonePose(sourceRoot);

  let sourceRest = originalSourceRest;
  if (sourceRestMode === 'firstFrame') {
    sourceMixer.setTime(0);
    sourceContainer.updateMatrixWorld(true);
    const sampled = captureBonePose(sourceRoot);
    sourceRest = sourceRestRotationOnly
      ? mergeRotationOnlyRest(originalSourceRest, sampled)
      : sampled;
  } else if (sourceRestMode === 'manual' && sourceRestOverride) {
    applyRestPose(sourceRoot, sourceAsset.restPose);
    applyBonePoseOverride(sourceRoot, sourceRestOverride);
    sourceContainer.updateMatrixWorld(true);

    const sampled = captureBonePose(sourceRoot);
    sourceRest = sourceRestRotationOnly
      ? mergeRotationOnlyRest(originalSourceRest, sampled)
      : sampled;
  }

  applyRestPose(sourceRoot, sourceAsset.restPose);
  sourceMixer.setTime(0);
  sourceRoot.updateMatrixWorld(true);

  applyRestPose(targetRoot, targetAsset.restPose);
  const targetRest = captureBonePose(targetRoot);

  const sourceHeight = computeRigHeightFromPose(sourceRest);
  const targetHeight = computeRigHeightFromPose(targetRest);
  const scaleRatio =
    autoScale && sourceHeight > 1e-8 && targetHeight > 1e-8
      ? targetHeight / sourceHeight
      : 1;

  const resolvedHeadSource =
    resolveBoneName(headSource, sourceNames, sourcePrefix) ||
    autodetectHeadName(sourceNames);
  const resolvedHeadTarget =
    resolveBoneName(headTarget, targetNames, targetPrefix) ||
    autodetectHeadName(targetNames);

  const sourceHead = sourceBones.get(resolvedHeadSource) || null;
  const targetHead = targetBones.get(resolvedHeadTarget) || null;
  const sourceHeadRest = sourceRest.get(resolvedHeadSource) || null;
  const targetHeadRest = targetRest.get(resolvedHeadTarget) || null;

  const targetGroups = new Map();
  for (const pair of runtimePairs) {
    if (!targetGroups.has(pair.targetName)) targetGroups.set(pair.targetName, []);
    targetGroups.get(pair.targetName).push(pair);
  }

  const targetOrder = [...targetGroups.keys()].sort((a, b) => {
    return boneDepth(targetBones.get(a)) - boneDepth(targetBones.get(b));
  });

  const duration = Math.max(preparedClip.duration || 0, 1 / Math.max(sampleFps, 1));
  const fps = clamp(Number(sampleFps) || 30, 1, 120);
  const sampleTimes = buildSampleTimes(duration, fps);

  const output = new Map();
  for (const targetName of targetOrder) {
    const group = targetGroups.get(targetName) || [];
    output.set(targetName, {
      times: sampleTimes,
      quaternionValues: [],
      positionValues: [],
      needsRotation: group.some((pair) => hasRotationChannel(pair.channels)),
      needsLocation: group.some((pair) => hasLocationChannel(pair.channels)),
      previousQuaternion: null,
    });
  }

  const identity = new THREE.Quaternion();

  for (let sampleIndex = 0; sampleIndex < sampleTimes.length; sampleIndex++) {
    const time = sampleTimes[sampleIndex];

    applyRestPose(sourceRoot, sourceAsset.restPose);
    sourceActionTransform.position.set(0, 0, 0);
    sourceActionTransform.quaternion.identity();
    sourceActionTransform.scale.set(1, 1, 1);
    sourceMixer.setTime(time);
    sourceContainer.updateMatrixWorld(true);

    applyRestPose(targetRoot, targetAsset.restPose);
    targetRoot.updateMatrixWorld(true);

    for (const targetName of targetOrder) {
      const targetBone = targetBones.get(targetName);
      const targetRestEntry = targetRest.get(targetName);
      const group = targetGroups.get(targetName) || [];
      if (!targetBone || !targetRestEntry) continue;

      let nextLocalPosition = targetRestEntry.localPosition.clone();
      let desiredWorldQuaternion = null;

      for (const pair of group) {
        const sourceBone = pair.sourceBone;
        const sourceRestEntry = sourceRest.get(pair.sourceName);
        if (!sourceBone || !sourceRestEntry) continue;

        if (hasRotationChannel(pair.channels)) {
          const sourcePoseWorldQ = new THREE.Quaternion();
          sourceBone.getWorldQuaternion(sourcePoseWorldQ);

          const delta = sourcePoseWorldQ
            .clone()
            .multiply(sourceRestEntry.worldQuaternion.clone().invert())
            .normalize();

          const amp = Number.isFinite(Number(pair.loc_scale))
            ? Number(pair.loc_scale)
            : 1;

          let deltaAdjusted = delta;
          if (Math.abs(amp - 1) > 1e-6) {
            const angle = 2 * Math.acos(clamp(delta.w, -1, 1));
            const sinHalf = Math.sqrt(Math.max(1 - delta.w * delta.w, 0));
            const axis = sinHalf < 1e-8
              ? new THREE.Vector3(1, 0, 0)
              : new THREE.Vector3(delta.x / sinHalf, delta.y / sinHalf, delta.z / sinHalf).normalize();
            deltaAdjusted = new THREE.Quaternion().setFromAxisAngle(axis, angle * amp);
          }

          if (pair.influence < 0.999999) {
            deltaAdjusted = identity.clone().slerp(deltaAdjusted, pair.influence).normalize();
          }

          desiredWorldQuaternion = deltaAdjusted
            .clone()
            .multiply(targetRestEntry.worldQuaternion)
            .normalize();
        }

        if (hasLocationChannel(pair.channels)) {
          const axes = normalizeAxes(pair.axes);
          const locationScale = scaleRatio * (Number.isFinite(Number(pair.loc_scale)) ? Number(pair.loc_scale) : 1);

          let candidateLocal = targetRestEntry.localPosition.clone();

          if (
            pair.anchor &&
            sourceHead &&
            targetHead &&
            sourceHeadRest &&
            targetHeadRest
          ) {
            const sourceBoneWorld = new THREE.Vector3();
            sourceBone.getWorldPosition(sourceBoneWorld);

            const currentSourceHeadInv = sourceHead.matrixWorld.clone().invert();
            const sourceCurrentHeadLocal = sourceBoneWorld.clone().applyMatrix4(currentSourceHeadInv);
            const sourceRestHeadLocal = sourceRestEntry.worldPosition
              .clone()
              .applyMatrix4(sourceHeadRest.worldMatrix.clone().invert());

            const motion = sourceCurrentHeadLocal.sub(sourceRestHeadLocal);
            applyAxesMask(motion, axes);
            motion.multiplyScalar(locationScale);

            const correction = targetHeadRest.worldQuaternion
              .clone()
              .invert()
              .multiply(sourceHeadRest.worldQuaternion)
              .normalize();
            motion.applyQuaternion(correction);

            const targetRestHeadLocal = targetRestEntry.worldPosition
              .clone()
              .applyMatrix4(targetHeadRest.worldMatrix.clone().invert());

            const desiredHeadLocal = targetRestHeadLocal.add(motion);
            const desiredWorld = desiredHeadLocal.applyMatrix4(targetHead.matrixWorld);

            candidateLocal = targetBone.parent
              ? targetBone.parent.worldToLocal(desiredWorld.clone())
              : desiredWorld;
          } else if (useWorldLocation) {
            const sourceWorld = new THREE.Vector3();
            sourceBone.getWorldPosition(sourceWorld);
            const worldDelta = sourceWorld.sub(sourceRestEntry.worldPosition);
            applyAxesMask(worldDelta, axes);
            worldDelta.multiplyScalar(locationScale);

            const desiredWorld = targetRestEntry.worldPosition.clone().add(worldDelta);
            candidateLocal = targetBone.parent
              ? targetBone.parent.worldToLocal(desiredWorld.clone())
              : desiredWorld;
          } else {
            const localDelta = sourceBone.position
              .clone()
              .sub(sourceRestEntry.localPosition);

            const sourceParentQ = sourceRestEntry.parentWorldQuaternion.clone();
            const targetParentInvQ = targetRestEntry.parentWorldQuaternion.clone().invert();

            localDelta
              .applyQuaternion(sourceParentQ)
              .multiplyScalar(locationScale)
              .applyQuaternion(targetParentInvQ);

            applyAxesMask(localDelta, axes);

            candidateLocal = targetRestEntry.localPosition.clone();
            if (axes.includes('X')) candidateLocal.x += localDelta.x;
            if (axes.includes('Y')) candidateLocal.y += localDelta.y;
            if (axes.includes('Z')) candidateLocal.z += localDelta.z;
          }

          if (pair.influence < 0.999999) {
            candidateLocal = targetRestEntry.localPosition
              .clone()
              .lerp(candidateLocal, pair.influence);
          }

          if (axes.includes('X')) nextLocalPosition.x = candidateLocal.x;
          if (axes.includes('Y')) nextLocalPosition.y = candidateLocal.y;
          if (axes.includes('Z')) nextLocalPosition.z = candidateLocal.z;
        }
      }

      if (group.some((pair) => hasLocationChannel(pair.channels))) {
        targetBone.position.copy(nextLocalPosition);
      }

      if (desiredWorldQuaternion) {
        const parentWorldQ = new THREE.Quaternion();
        if (targetBone.parent) targetBone.parent.getWorldQuaternion(parentWorldQ);

        const localQ = parentWorldQ
          .clone()
          .invert()
          .multiply(desiredWorldQuaternion)
          .normalize();

        targetBone.quaternion.copy(localQ);
      }

      targetRoot.updateMatrixWorld(true);
    }

    for (const targetName of targetOrder) {
      const targetBone = targetBones.get(targetName);
      const row = output.get(targetName);
      if (!targetBone || !row) continue;

      if (row.needsRotation) {
        const q = targetBone.quaternion.clone().normalize();
        if (row.previousQuaternion && row.previousQuaternion.dot(q) < 0) {
          q.set(-q.x, -q.y, -q.z, -q.w);
        }
        row.previousQuaternion = q.clone();
        row.quaternionValues.push(q.x, q.y, q.z, q.w);
      }

      if (row.needsLocation) {
        row.positionValues.push(
          targetBone.position.x,
          targetBone.position.y,
          targetBone.position.z
        );
      }
    }

    if (typeof onProgress === 'function') {
      onProgress((sampleIndex + 1) / sampleTimes.length, sampleIndex + 1, sampleTimes.length);
      if ((sampleIndex & 7) === 7) {
        await nextAnimationFrame();
      }
    }
  }

  sourceMixer.stopAllAction();
  sourceMixer.uncacheRoot(sourceContainer);

  const tracks = [];
  for (const [targetName, row] of output) {
    if (row.needsRotation && row.quaternionValues.length) {
      tracks.push(new THREE.QuaternionKeyframeTrack(
        targetName + '.quaternion',
        row.times,
        row.quaternionValues
      ));
    }

    if (row.needsLocation && row.positionValues.length) {
      tracks.push(new THREE.VectorKeyframeTrack(
        targetName + '.position',
        row.times,
        row.positionValues
      ));
    }
  }

  if (!tracks.length) {
    throw new Error('El retarget no produjo tracks.');
  }

  const clip = new THREE.AnimationClip(clipName, duration, tracks);
  clip.resetDuration();

  return {
    clip,
    report: {
      validPairs: runtimePairs.length,
      totalPairs: normalizedPairs.length,
      invalidPairs: invalid,
      sampleCount: sampleTimes.length,
      scaleRatio,
      sourceHead: resolvedHeadSource,
      targetHead: resolvedHeadTarget,
      mappedBones: targetOrder,
    },
  };
}

function mergeRotationOnlyRest(originalPose, sampledPose) {
  const merged = new Map();

  for (const [name, original] of originalPose) {
    const sampled = sampledPose.get(name);
    const worldQuaternion =
      sampled?.worldQuaternion?.clone() ||
      original.worldQuaternion.clone();

    merged.set(name, {
      ...clonePoseEntry(original),
      worldQuaternion,
      localQuaternion:
        sampled?.localQuaternion?.clone() ||
        original.localQuaternion.clone(),
      worldMatrix: composeMatrix(
        original.worldPosition,
        worldQuaternion,
        original.worldScale
      ),
    });
  }

  return merged;
}

function applyBonePoseOverride(root, override) {
  if (!override) return;

  const entries = override instanceof Map
    ? override
    : new Map(Object.entries(override));

  root.traverse((node) => {
    if (!node.isBone || !node.name) return;

    const value = entries.get(node.name);
    if (!value) return;

    const position = value.position;
    const quaternion = value.quaternion;
    const scale = value.scale;

    if (position) {
      if (Array.isArray(position)) {
        node.position.fromArray(position);
      } else {
        node.position.set(
          Number(position.x) || 0,
          Number(position.y) || 0,
          Number(position.z) || 0
        );
      }
    }

    if (quaternion) {
      if (Array.isArray(quaternion)) {
        node.quaternion.fromArray(quaternion);
      } else {
        node.quaternion.set(
          Number(quaternion.x) || 0,
          Number(quaternion.y) || 0,
          Number(quaternion.z) || 0,
          Number.isFinite(Number(quaternion.w)) ? Number(quaternion.w) : 1
        );
      }
      node.quaternion.normalize();
    }

    if (scale) {
      if (Array.isArray(scale)) {
        node.scale.fromArray(scale);
      } else {
        node.scale.set(
          Number(scale.x) || 1,
          Number(scale.y) || 1,
          Number(scale.z) || 1
        );
      }
    }
  });

  root.updateMatrixWorld(true);
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
}

function captureBonePose(root) {
  root.updateMatrixWorld(true);
  const map = new Map();

  root.traverse((node) => {
    if (!node.isBone || !node.name) return;

    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    node.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

    const parentWorldQuaternion = new THREE.Quaternion();
    if (node.parent) node.parent.getWorldQuaternion(parentWorldQuaternion);

    map.set(node.name, {
      name: node.name,
      localPosition: node.position.clone(),
      localQuaternion: node.quaternion.clone(),
      localScale: node.scale.clone(),
      worldPosition,
      worldQuaternion,
      worldScale,
      worldMatrix: node.matrixWorld.clone(),
      parentWorldQuaternion,
      parentName: node.parent?.name || '',
    });
  });

  return map;
}

function clonePoseEntry(entry) {
  return {
    name: entry.name,
    localPosition: entry.localPosition.clone(),
    localQuaternion: entry.localQuaternion.clone(),
    localScale: entry.localScale.clone(),
    worldPosition: entry.worldPosition.clone(),
    worldQuaternion: entry.worldQuaternion.clone(),
    worldScale: entry.worldScale.clone(),
    worldMatrix: entry.worldMatrix.clone(),
    parentWorldQuaternion: entry.parentWorldQuaternion.clone(),
    parentName: entry.parentName,
  };
}

function composeMatrix(position, quaternion, scale) {
  return new THREE.Matrix4().compose(
    position.clone(),
    quaternion.clone(),
    scale.clone()
  );
}

function boneMap(root) {
  const map = new Map();
  root?.traverse((node) => {
    if (node.isBone && node.name && !map.has(node.name)) {
      map.set(node.name, node);
    }
  });
  return map;
}

function computeRigHeightFromPose(pose) {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entry of pose.values()) {
    minY = Math.min(minY, entry.worldPosition.y);
    maxY = Math.max(maxY, entry.worldPosition.y);
  }

  const height = maxY - minY;
  return Number.isFinite(height) ? height : 0;
}

function autodetectHeadName(names) {
  const exact = names.find((name) => /(^|[:_.-])head$/i.test(name));
  if (exact) return exact;
  return names.find((name) => /head/i.test(name)) || '';
}

function boneDepth(bone) {
  let depth = 0;
  let current = bone?.parent || null;
  while (current) {
    if (current.isBone) depth += 1;
    current = current.parent;
  }
  return depth;
}

function buildSampleTimes(duration, fps) {
  const step = 1 / Math.max(fps, 1);
  const times = [];
  for (let t = 0; t < duration - 1e-7; t += step) {
    times.push(Number(t.toFixed(7)));
  }
  times.push(duration);
  return times;
}

function hasRotationChannel(channels) {
  return channels === 'ROT' || channels === 'LOC_ROT';
}

function hasLocationChannel(channels) {
  return channels === 'LOC' || channels === 'LOC_ROT';
}

function applyAxesMask(vector, axes) {
  if (!axes.includes('X')) vector.x = 0;
  if (!axes.includes('Y')) vector.y = 0;
  if (!axes.includes('Z')) vector.z = 0;
  return vector;
}

function normalizeAxes(value) {
  const raw = String(value || 'XYZ').toUpperCase();
  const out = ['X', 'Y', 'Z'].filter((axis) => raw.includes(axis)).join('');
  return out || 'XYZ';
}

function shouldTransferLocation(semanticKey) {
  return semanticKey === 'hips' || semanticKey === 'root';
}

function normalizeExactBoneName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/^(def|org|mch|ctrl)[-_:]/, '')
    .replace(/[^a-z0-9]/g, '');
}

function semanticBoneKey(name) {
  let raw = String(name || '').toLowerCase();

  const side =
    /(^|[._:\-])left([._:\-]|$)|(^|[._:\-])l([._:\-]|$)|\.l$|_l$|^left|^l(?=[a-z])/.test(raw)
      ? 'left'
      : /(^|[._:\-])right([._:\-]|$)|(^|[._:\-])r([._:\-]|$)|\.r$|_r$|^right|^r(?=[a-z])/.test(raw)
        ? 'right'
        : '';

  raw = raw
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/^(def|org|mch|ctrl)[-_:]/, '')
    .replace(/\.l$|\.r$|_l$|_r$/g, '')
    .replace(/left|right/g, '')
    .replace(/[^a-z0-9]/g, '');

  const fingerMatch = raw.match(/(thumb|index|middle|ring|pinky|little)(?:finger)?0*([123])/);
  if (fingerMatch) {
    const finger = fingerMatch[1] === 'little' ? 'pinky' : fingerMatch[1];
    return side + finger + fingerMatch[2];
  }

  if (/shoulder|clavicle/.test(raw)) return side + 'shoulder';
  if (/forearm|lowerarm|elbow/.test(raw)) return side + 'forearm';
  if (/upperarm/.test(raw) || raw === 'arm' || /armfk/.test(raw)) return side + 'upperarm';
  if (/hand|wrist/.test(raw)) return side + 'hand';

  if (/upperleg|upleg|thigh/.test(raw)) return side + 'thigh';
  if (/lowerleg|calf|shin|knee/.test(raw) || raw === 'leg' || /legfk/.test(raw)) return side + 'shin';
  if (/toe/.test(raw)) return side + 'toe';
  if (/foot|ankle/.test(raw)) return side + 'foot';

  if (/hips|pelvis/.test(raw)) return 'hips';
  if (/root|master/.test(raw) || /^c?pos$/.test(raw)) return 'root';
  if (/head/.test(raw)) return 'head';
  if (/neck/.test(raw)) return 'neck';

  const spineMatch = raw.match(/spine(?:fk)?0*([0-9]+)/);
  if (spineMatch) return 'spine' + spineMatch[1];
  if (/chest/.test(raw)) return 'chest';
  if (/spine/.test(raw)) return 'spine';

  return side + raw;
}

function smartStoredName(name, prefix, fullNames) {
  if (!prefix || !name.startsWith(prefix)) return name;
  const stripped = name.slice(prefix.length);
  if (!stripped) return name;
  const set = new Set(fullNames || []);
  if (set.has(name) && set.has(stripped)) return name;
  return stripped;
}

function stripPrefix(name, prefix) {
  if (prefix && String(name).startsWith(prefix)) return String(name).slice(prefix.length);
  return String(name || '');
}

function makeId(prefix) {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
