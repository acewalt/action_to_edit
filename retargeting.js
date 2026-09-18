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

  // Three.js removes binding-reserved characters (: . / []) from FBX node
  // names. Compare a compact browser form so "FK-UpperArm.L" can match
  // "FK-UpperArmL" and "mixamorig1:LeftArm" can be detected as mixamorig1.
  const bindingKey = (value) =>
    String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const available = new Set([...set].map(bindingKey));

  const score = (prefix) => {
    let count = 0;
    for (const short of names) {
      if (available.has(bindingKey(prefix + short))) count += 1;
    }
    return count;
  };

  const candidates = new Set(['', fallback || '']);

  for (const bone of set) {
    for (const short of names) {
      if (!short) continue;

      if (
        bone.toLowerCase().endsWith(short.toLowerCase()) &&
        bone.length > short.length
      ) {
        candidates.add(bone.slice(0, bone.length - short.length));
      }
    }
  }

  let best = '';
  let bestScore = -1;

  for (const prefix of candidates) {
    const current = score(prefix);
    if (
      current > bestScore ||
      (current === bestScore && prefix.length < best.length)
    ) {
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

  const targetScore = (name) => {
    const n = String(name || '').toLowerCase();
    let score = 0;
    if (/^fk[-_]/.test(n)) score += 80;
    if (/^def[-_]/.test(n)) score += 70;
    if (/^str[-_]/.test(n)) score += 20;
    if (/^p-str[-_]/.test(n)) score -= 10;
    if (/fk-hng|hng|hanger/.test(n)) score -= 45;
    if (/ik-|pole|target|line-|dsp-|snap-|scale-|root-/.test(n)) score -= 55;
    if (/twist|tweak|roll/.test(n)) score -= 25;
    return score;
  };

  for (const name of target) {
    const stripped = stripPrefix(name, targetPrefix);
    const exact = normalizeExactBoneName(stripped);
    const semantic = semanticBoneKey(stripped);

    if (exact && !targetByExact.has(exact)) targetByExact.set(exact, name);

    if (semantic) {
      const current = targetBySemantic.get(semantic);
      if (!current || targetScore(name) > targetScore(current)) {
        targetBySemantic.set(semantic, name);
      }
    }
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
      axes: 'XYZ',
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
  autoBakeIk = false,
  ikChains = [],
  customIkSources = null,
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

  restoreAssetRest(sourceRoot, sourceAsset);
  restoreAssetRest(targetRoot, targetAsset);

  sourceContainer.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);

  const sourceBones = boneMap(sourceRoot);
  const targetBones = boneMap(targetRoot);
  const sourceNames = [...sourceBones.keys()];
  const targetNames = [...targetBones.keys()];

  // BlendCap runs inside Blender, so mapping an FK control works because the
  // target constraint/driver stack propagates that control to the deform
  // skeleton. FBX + Three.js does NOT carry/evaluate that Blender rig graph.
  //
  // A bone can still influence the mesh WITHOUT direct skin weights when it is
  // an ancestor of weighted bones (root/pelvis carrier). Keep those hierarchy
  // carriers; only redirect controls that are outside the exported deform tree.
  const targetSkinInfo = collectTargetSkinHierarchy(targetRoot);
  const weightedTargetBones = targetSkinInfo.weighted;
  const influentialTargetBones = targetSkinInfo.influential;

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

    const effectiveTargetName = resolveBrowserBakeTarget({
      requestedName: targetName,
      pair,
      targetBones,
      weightedTargetBones,
      influentialTargetBones,
    });

    runtimePairs.push({
      ...pair,
      sourceName,
      requestedTargetName: targetName,
      targetName: effectiveTargetName,
      sourceBone: sourceBones.get(sourceName),
      targetBone: targetBones.get(effectiveTargetName),
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
    restoreAssetRest(sourceRoot, sourceAsset);
    applyBonePoseOverride(sourceRoot, sourceRestOverride);
    sourceContainer.updateMatrixWorld(true);

    const sampled = captureBonePose(sourceRoot);
    sourceRest = sourceRestRotationOnly
      ? mergeRotationOnlyRest(originalSourceRest, sampled)
      : sampled;
  }

  restoreAssetRest(sourceRoot, sourceAsset);
  sourceMixer.setTime(0);
  sourceRoot.updateMatrixWorld(true);

  restoreAssetRest(targetRoot, targetAsset);
  const targetRest = captureBonePose(targetRoot);

  // BlendCap FK->IK is a SECOND bake. It samples the already-retargeted target
  // FK chain, puts the IK end control on the chain-end delta-from-rest, and
  // computes the pole from the posed target chain geometry. In the browser our
  // direct-deform chain is the FK proxy because Blender constraints/drivers are
  // not evaluated by Three.js.
  const ikBake = autoBakeIk
    ? buildBlendCapIkBakeChains({
        ikChains,
        customIkSources,
        runtimePairs,
        targetBones,
        targetNames,
        targetPrefix,
        targetRest,
      })
    : {
        chains: [],
        skipped: [],
      };

  const sourceHeight = computeRigHeightFromPose(
    sourceRest,
    new Set(runtimePairs.map((pair) => pair.sourceName))
  );
  const targetHeight = computeRigHeightFromPose(
    targetRest,
    new Set(runtimePairs.map((pair) => pair.targetName))
  );
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

    restoreAssetRest(sourceRoot, sourceAsset);
    sourceActionTransform.position.set(0, 0, 0);
    sourceActionTransform.quaternion.identity();
    sourceActionTransform.scale.set(1, 1, 1);
    sourceMixer.setTime(time);
    sourceContainer.updateMatrixWorld(true);

    restoreAssetRest(targetRoot, targetAsset);
    targetRoot.updateMatrixWorld(true);

    for (const targetName of targetOrder) {
      const targetBone = targetBones.get(targetName);
      const targetRestEntry = targetRest.get(targetName);
      const group = targetGroups.get(targetName) || [];
      if (!targetBone || !targetRestEntry) continue;

      let nextLocalPosition = targetRestEntry.localPosition.clone();
      let desiredWorldQuaternion = null;
      let worldLocationAccum = null;
      let wroteWorldLocation = false;

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

          // BlendCap exact world-delta transfer:
          // S_pose * inverse(S_rest) * T_rest.
          // FBXLoader has already converted both files into Three.js world
          // coordinates, so an extra humanoid-frame conjugation would apply
          // the axis correction twice.
          desiredWorldQuaternion = deltaAdjusted
            .clone()
            .multiply(targetRestEntry.worldQuaternion)
            .normalize();
        }

        if (hasLocationChannel(pair.channels)) {
          const axes = blenderAxesToThreeWorld(pair.axes);
          const pairScale =
            Number.isFinite(Number(pair.loc_scale))
              ? Number(pair.loc_scale)
              : 1;

          let worldContribution = new THREE.Vector3();

          if (
            pair.anchor &&
            sourceHead &&
            targetHead &&
            sourceHeadRest &&
            targetHeadRest
          ) {
            // HEAD_LOCAL stays head-relative by design.
            const sourceBoneWorld = new THREE.Vector3();
            sourceBone.getWorldPosition(sourceBoneWorld);

            const currentSourceHeadInv =
              sourceHead.matrixWorld.clone().invert();

            const sourceCurrentHeadLocal =
              sourceBoneWorld.clone().applyMatrix4(currentSourceHeadInv);

            const sourceRestHeadLocal =
              sourceRestEntry.worldPosition
                .clone()
                .applyMatrix4(sourceHeadRest.worldMatrix.clone().invert());

            const motion =
              sourceCurrentHeadLocal.sub(sourceRestHeadLocal);

            applyAxesMask(motion, normalizeAxes(pair.axes));
            motion.multiplyScalar(scaleRatio * pairScale);

            const correction =
              targetHeadRest.worldQuaternion
                .clone()
                .invert()
                .multiply(sourceHeadRest.worldQuaternion)
                .normalize();

            motion.applyQuaternion(correction);

            const targetRestHeadLocal =
              targetRestEntry.worldPosition
                .clone()
                .applyMatrix4(targetHeadRest.worldMatrix.clone().invert());

            const desiredHeadLocal =
              targetRestHeadLocal.add(motion);

            const desiredWorld =
              desiredHeadLocal.applyMatrix4(targetHead.matrixWorld);

            const candidateLocal = targetBone.parent
              ? targetBone.parent.worldToLocal(desiredWorld.clone())
              : desiredWorld;

            if (pair.influence < 0.999999) {
              candidateLocal.lerp(
                targetRestEntry.localPosition,
                1 - pair.influence
              );
            }

            nextLocalPosition.copy(candidateLocal);
          } else {
            if (useWorldLocation) {
              const sourceWorld = new THREE.Vector3();
              sourceBone.getWorldPosition(sourceWorld);

              worldContribution
                .copy(sourceWorld)
                .sub(sourceRestEntry.worldPosition)
                .multiplyScalar(scaleRatio * pairScale);
            } else {
              // Three.js bone.position is parent-local. Lift that delta into
              // world using the SOURCE REST parent frame, filter world axes,
              // then project into the TARGET REST parent frame. This is the
              // browser equivalent of BlendCap's world-component BASIS bake.
              worldContribution
                .copy(sourceBone.position)
                .sub(sourceRestEntry.localPosition);

              const sourceParentLinear =
                new THREE.Matrix3()
                  .setFromMatrix4(
                    sourceRestEntry.parentWorldMatrix ||
                    new THREE.Matrix4()
                  );

              worldContribution
                .applyMatrix3(sourceParentLinear)
                .multiplyScalar(scaleRatio * pairScale);
            }

            applyAxesMask(worldContribution, axes);

            if (pair.influence < 0.999999) {
              worldContribution.multiplyScalar(pair.influence);
            }

            if (!worldLocationAccum) {
              worldLocationAccum = new THREE.Vector3();
            }

            if (axes.includes('X')) {
              worldLocationAccum.x = worldContribution.x;
              wroteWorldLocation = true;
            }
            if (axes.includes('Y')) {
              worldLocationAccum.y = worldContribution.y;
              wroteWorldLocation = true;
            }
            if (axes.includes('Z')) {
              worldLocationAccum.z = worldContribution.z;
              wroteWorldLocation = true;
            }
          }
        }
      }

      if (wroteWorldLocation && worldLocationAccum) {
        const parentLinearInv =
          new THREE.Matrix3()
            .setFromMatrix4(
              targetRestEntry.parentWorldMatrix ||
              new THREE.Matrix4()
            )
            .invert();

        const localDelta =
          worldLocationAccum
            .clone()
            .applyMatrix3(parentLinearInv);

        nextLocalPosition =
          targetRestEntry.localPosition
            .clone()
            .add(localDelta);
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

    if (ikBake.chains.length) {
      targetRoot.updateMatrixWorld(true);
      sampleBlendCapIkBakeChains(
        ikBake.chains,
        targetRest
      );
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

  if (ikBake.chains.length) {
    appendBlendCapIkTracks(
      tracks,
      ikBake.chains,
      sampleTimes
    );
  }

  if (!tracks.length) {
    throw new Error('El retarget no produjo tracks.');
  }

  // STRICT TARGET REST BASELINE
  // --------------------------------
  // A retargeted Action must be independent from whichever Action the target
  // happened to play before it. Three.js clips are sparse: an unkeyed channel
  // can otherwise remain at a stale value until another clip writes it.
  //
  // Bake constant rest tracks for every bone that can influence the skin
  // (directly weighted OR an ancestor carrier). Animated channels keep the
  // retarget data; missing channels are forced to the imported target rest.
  const keyed = new Map();

  for (const track of tracks) {
    let parsed = null;
    try {
      parsed = THREE.PropertyBinding.parseTrackName(track.name);
    } catch {
      parsed = null;
    }

    if (!parsed?.nodeName || !parsed?.propertyName) continue;

    if (!keyed.has(parsed.nodeName)) {
      keyed.set(parsed.nodeName, new Set());
    }

    keyed.get(parsed.nodeName).add(parsed.propertyName);
  }

  const baselineTimes = [0, duration];

  for (const boneName of influentialTargetBones) {
    const rest = targetRest.get(boneName);
    if (!rest) continue;

    const channels = keyed.get(boneName) || new Set();

    if (!channels.has('position')) {
      const p = rest.localPosition;
      tracks.push(new THREE.VectorKeyframeTrack(
        boneName + '.position',
        baselineTimes,
        [p.x, p.y, p.z, p.x, p.y, p.z]
      ));
    }

    if (!channels.has('quaternion')) {
      const q = rest.localQuaternion.clone().normalize();
      tracks.push(new THREE.QuaternionKeyframeTrack(
        boneName + '.quaternion',
        baselineTimes,
        [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]
      ));
    }

    // IMPORTANT: do not bake a constant .scale baseline here.
    // CloudRig/Rigify/ARP FBX exports commonly use inverse-bind/control scales
    // such as 0.01/100 that are not the animation hierarchy scale. Writing
    // those values into an AnimationClip is what made retarget results become
    // gigantic. Position/quaternion are isolated; scale stays owned by the
    // imported Target FBX hierarchy.
  }

  const clip = new THREE.AnimationClip(clipName, duration, tracks);
  clip.resetDuration();

  const fkRequestedPairs = normalizedPairs.filter((pair) =>
    /^fk[-_:]/i.test(String(pair.target || '').trim())
  ).length;

  const fkResolvedPairs = runtimePairs.filter((pair) =>
    /^fk[-_:]/i.test(String(pair.requestedTargetName || '').trim())
  ).length;

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
      redirectedPairs: runtimePairs
        .filter((pair) => pair.requestedTargetName !== pair.targetName)
        .map((pair) => ({
          source: pair.sourceName,
          requestedTarget: pair.requestedTargetName,
          bakedTarget: pair.targetName,
        })),
      weightedTargetBoneCount: weightedTargetBones.size,
      influentialTargetBoneCount: influentialTargetBones.size,
      restBaselineBoneCount: influentialTargetBones.size,
      restBaselineMode: 'bind-pose-no-scale',
      fkRequestedPairs,
      fkResolvedPairs,
      ikBakedChains: ikBake.chains.length,
      ikSkippedChains: ikBake.skipped,
    },
  };
}

function resolveControlBoneName(
  requested,
  targetNames,
  prefix = ''
) {
  if (!requested) return '';

  const names = targetNames || [];
  const set = new Set(names);

  if (set.has(requested)) return requested;
  if (prefix && set.has(prefix + requested)) {
    return prefix + requested;
  }

  const lower = String(requested).toLowerCase();
  const directCase = names.find(
    (name) => String(name).toLowerCase() === lower
  );
  if (directCase) return directCase;

  if (prefix) {
    const prefixed = (prefix + requested).toLowerCase();
    const prefixedCase = names.find(
      (name) => String(name).toLowerCase() === prefixed
    );
    if (prefixedCase) return prefixedCase;
  }

  // FBXLoader sanitizes "." and ":" from binding names.
  const key = normalizeExactBoneName(requested);

  return (
    names.find((name) =>
      normalizeExactBoneName(stripPrefix(name, prefix)) === key ||
      normalizeExactBoneName(name) === key
    ) || ''
  );
}

function runtimePairForSourceRole(
  runtimePairs,
  requestedSource,
  fallbackSemantic
) {
  const requestedKey = normalizeExactBoneName(requestedSource);
  const semantic =
    semanticBoneKey(requestedSource) ||
    fallbackSemantic;

  let pair = null;

  if (requestedKey) {
    pair = runtimePairs.find((entry) =>
      normalizeExactBoneName(entry.sourceName) === requestedKey ||
      normalizeExactBoneName(entry.source) === requestedKey
    ) || null;
  }

  if (!pair && semantic) {
    pair = runtimePairs.find((entry) =>
      semanticBoneKey(entry.sourceName) === semantic ||
      semanticBoneKey(entry.source) === semantic
    ) || null;
  }

  if (!pair && fallbackSemantic) {
    pair = runtimePairs.find((entry) =>
      semanticBoneKey(entry.sourceName) === fallbackSemantic ||
      semanticBoneKey(entry.source) === fallbackSemantic
    ) || null;
  }

  return pair;
}

function buildBlendCapIkBakeChains({
  ikChains,
  customIkSources,
  runtimePairs,
  targetBones,
  targetNames,
  targetPrefix,
  targetRest,
}) {
  const chains = [];
  const skipped = [];

  const custom = customIkSources || {};
  const useCustom = Boolean(custom.enabled);

  const defaults = {
    left_hand: 'LeftHand',
    right_hand: 'RightHand',
    left_foot: 'LeftFoot',
    right_foot: 'RightFoot',
    left_forearm: 'LeftForeArm',
    right_forearm: 'RightForeArm',
    left_shin: 'LeftLeg',
    right_shin: 'RightLeg',
  };

  for (const row of ikChains || []) {
    const kind = String(row?.limb_kind || '').toUpperCase();
    const side = String(row?.side || '').toUpperCase();

    if (
      !['ARM', 'LEG'].includes(kind) ||
      !['L', 'R'].includes(side)
    ) {
      continue;
    }

    const sideWord = side === 'L' ? 'left' : 'right';

    const endField =
      kind === 'ARM'
        ? sideWord + '_hand'
        : sideWord + '_foot';

    const midField =
      kind === 'ARM'
        ? sideWord + '_forearm'
        : sideWord + '_shin';

    const endSource =
      (useCustom && custom[endField]) ||
      defaults[endField];

    const midSource =
      (useCustom && custom[midField]) ||
      defaults[midField];

    const rootSemantic =
      sideWord +
      (kind === 'ARM' ? 'upperarm' : 'thigh');

    const endSemantic =
      sideWord +
      (kind === 'ARM' ? 'hand' : 'foot');

    const midSemantic =
      sideWord +
      (kind === 'ARM' ? 'forearm' : 'shin');

    const endPair = runtimePairForSourceRole(
      runtimePairs,
      endSource,
      endSemantic
    );

    const midPair = runtimePairForSourceRole(
      runtimePairs,
      midSource,
      midSemantic
    );

    const rootPair = runtimePairForSourceRole(
      runtimePairs,
      '',
      rootSemantic
    );

    const ikName = resolveControlBoneName(
      row.ik_control,
      targetNames,
      targetPrefix
    );

    const poleName = resolveControlBoneName(
      row.pole_control,
      targetNames,
      targetPrefix
    );

    const label = kind + ' ' + side;

    if (!endPair?.targetName || !ikName) {
      skipped.push(
        label +
        ': falta FK end o IK control.'
      );
      continue;
    }

    const endBone =
      targetBones.get(endPair.targetName);

    const ikBone =
      targetBones.get(ikName);

    const endRest =
      targetRest.get(endPair.targetName);

    const ikRest =
      targetRest.get(ikName);

    if (!endBone || !ikBone || !endRest || !ikRest) {
      skipped.push(
        label +
        ': cadena/end control no resolvió en el Target.'
      );
      continue;
    }

    const chain = {
      label,
      kind,
      side,
      endName: endPair.targetName,
      midName: midPair?.targetName || '',
      rootName: rootPair?.targetName || '',
      ikName,
      poleName,
      endBone,
      midBone: midPair?.targetName
        ? targetBones.get(midPair.targetName) || null
        : null,
      rootBone: rootPair?.targetName
        ? targetBones.get(rootPair.targetName) || null
        : null,
      ikBone,
      poleBone: poleName
        ? targetBones.get(poleName) || null
        : null,
      endRestWorld: endRest.worldMatrix.clone(),
      endRestWorldInv: endRest.worldMatrix.clone().invert(),
      ikRestWorld: ikRest.worldMatrix.clone(),
      ikPositionValues: [],
      ikQuaternionValues: [],
      polePositionValues: [],
      previousIkQuaternion: null,
      previousPerp: null,
      fallbackPerp: null,
    };

    if (
      chain.rootBone &&
      chain.midBone &&
      chain.poleBone
    ) {
      const rootRest =
        targetRest.get(chain.rootName);
      const midRest =
        targetRest.get(chain.midName);

      if (rootRest && midRest) {
        const poleSeed = computeBlendCapPolePosition(
          rootRest.worldPosition,
          midRest.worldPosition,
          endRest.worldPosition,
          new THREE.Vector3(0, 0, 1),
          null
        );

        chain.fallbackPerp =
          poleSeed.perp?.clone() ||
          new THREE.Vector3(0, 0, 1);
        chain.previousPerp =
          poleSeed.perp?.clone() ||
          null;
      }
    }

    chains.push(chain);
  }

  return { chains, skipped };
}

function computeBlendCapPolePosition(
  rootHead,
  midHead,
  endHead,
  fallbackAxis,
  previousPerp
) {
  const chainVec =
    endHead.clone().sub(rootHead);

  if (chainVec.lengthSq() < 1e-12) {
    return {
      position:
        midHead
          .clone()
          .addScaledVector(fallbackAxis, 0.1),
      perp: null,
    };
  }

  const lowerVec =
    endHead.clone().sub(midHead);

  const projected =
    chainVec
      .clone()
      .multiplyScalar(
        lowerVec.dot(chainVec) /
        chainVec.lengthSq()
      );

  let perp =
    projected.sub(lowerVec);

  let usedFallback = false;

  if (perp.length() < 1e-4) {
    perp = fallbackAxis.clone();

    const projection =
      chainVec
        .clone()
        .multiplyScalar(
          perp.dot(chainVec) /
          chainVec.lengthSq()
        );

    perp.sub(projection);

    if (perp.lengthSq() < 1e-12) {
      perp.set(0, 1, 0);

      const projection2 =
        chainVec
          .clone()
          .multiplyScalar(
            perp.dot(chainVec) /
            chainVec.lengthSq()
          );

      perp.sub(projection2);
    }

    usedFallback = true;
  }

  if (perp.lengthSq() < 1e-12) {
    return {
      position: midHead.clone(),
      perp: null,
    };
  }

  perp.normalize();

  if (
    previousPerp &&
    perp.dot(previousPerp) < 0
  ) {
    perp.negate();
  }

  const position =
    midHead
      .clone()
      .addScaledVector(
        perp,
        chainVec.length() * 0.4
      );

  return {
    position,
    perp: usedFallback ? null : perp,
  };
}

function sampleBlendCapIkBakeChains(
  chains,
  targetRest
) {
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  for (const chain of chains) {
    const desiredWorld =
      chain.endBone.matrixWorld
        .clone()
        .multiply(chain.endRestWorldInv)
        .multiply(chain.ikRestWorld);

    const parentInv =
      chain.ikBone.parent
        ? chain.ikBone.parent.matrixWorld
            .clone()
            .invert()
        : new THREE.Matrix4();

    const local =
      parentInv.multiply(desiredWorld);

    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();

    local.decompose(p, q, sc);
    q.normalize();

    if (
      chain.previousIkQuaternion &&
      chain.previousIkQuaternion.dot(q) < 0
    ) {
      q.set(-q.x, -q.y, -q.z, -q.w);
    }

    chain.previousIkQuaternion = q.clone();

    chain.ikPositionValues.push(
      p.x,
      p.y,
      p.z
    );

    chain.ikQuaternionValues.push(
      q.x,
      q.y,
      q.z,
      q.w
    );

    if (
      chain.rootBone &&
      chain.midBone &&
      chain.poleBone
    ) {
      const rootPos = new THREE.Vector3();
      const midPos = new THREE.Vector3();
      const endPos = new THREE.Vector3();

      chain.rootBone.getWorldPosition(rootPos);
      chain.midBone.getWorldPosition(midPos);
      chain.endBone.getWorldPosition(endPos);

      const pole = computeBlendCapPolePosition(
        rootPos,
        midPos,
        endPos,
        chain.fallbackPerp ||
          new THREE.Vector3(0, 0, 1),
        chain.previousPerp
      );

      if (pole.perp) {
        chain.previousPerp =
          pole.perp.clone();
      }

      const poleParentInv =
        chain.poleBone.parent
          ? chain.poleBone.parent.matrixWorld
              .clone()
              .invert()
          : new THREE.Matrix4();

      const localPole =
        pole.position
          .clone()
          .applyMatrix4(poleParentInv);

      chain.polePositionValues.push(
        localPole.x,
        localPole.y,
        localPole.z
      );
    }
  }
}

function appendBlendCapIkTracks(
  tracks,
  chains,
  sampleTimes
) {
  for (const chain of chains) {
    if (chain.ikPositionValues.length) {
      tracks.push(
        new THREE.VectorKeyframeTrack(
          chain.ikName + '.position',
          sampleTimes,
          chain.ikPositionValues
        )
      );
    }

    if (chain.ikQuaternionValues.length) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          chain.ikName + '.quaternion',
          sampleTimes,
          chain.ikQuaternionValues
        )
      );
    }

    if (
      chain.poleName &&
      chain.polePositionValues.length
    ) {
      tracks.push(
        new THREE.VectorKeyframeTrack(
          chain.poleName + '.position',
          sampleTimes,
          chain.polePositionValues
        )
      );
    }
  }
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

function restoreHierarchySnapshot(root, snapshot) {
  if (!root || !Array.isArray(snapshot) || !snapshot.length) return false;

  const nodes = [];
  root.traverse((node) => nodes.push(node));

  if (nodes.length !== snapshot.length) return false;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const rest = snapshot[i];
    if (!rest) continue;

    if (Array.isArray(rest.position)) node.position.fromArray(rest.position);
    if (Array.isArray(rest.quaternion)) node.quaternion.fromArray(rest.quaternion);
    if (Array.isArray(rest.scale)) node.scale.fromArray(rest.scale);
    node.visible = rest.visible !== false;
  }

  root.updateMatrixWorld(true);

  root.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) {
      node.skeleton.update();
    }
  });

  return true;
}

function restoreAssetRest(root, asset) {
  if (!root || !asset) return;

  // RETARGET REST != normal Action playback baseline.
  //
  // Existing FBX Actions are previewed against the exact hierarchy imported
  // by FBXLoader (app.js). Retargeting, however, must start from the actual
  // unanimated bind/rest skeleton — the same state shown by Redefine Rest Pose.
  //
  // This separation is intentional:
  //   normal Action playback -> imported animation hierarchy
  //   retarget bake          -> true bind/rest pose
  //
  // A Blender/CloudRig FBX can be exported while the armature is left in the
  // last pose of an Action (for example "fail"). If we use that imported pose
  // as the retarget baseline, every new Action is baked ON TOP of the ending
  // pose of that Action. That is exactly the failure seen in the viewport.
  restoreHierarchySnapshot(
    root,
    asset.restHierarchy
  );

  forceBindPose(root);

  root.updateMatrixWorld(true);
}

function forceBindPose(root) {
  if (!root) return;

  const skeletons = new Set();

  root.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) {
      skeletons.add(node.skeleton);
    }
  });

  for (const skeleton of skeletons) {
    try {
      skeleton.pose();
    } catch {
      // Keep the restored hierarchy for malformed / incomplete skeletons.
    }
  }

  root.updateMatrixWorld(true);

  for (const skeleton of skeletons) {
    skeleton.update();
  }
}

function applyRestPose(object, restPose) {
  if (!object) return;

  forceBindPose(object);

  if (restPose) {
    object.traverse((node) => {
      if (!node.isBone || !node.name) return;

      const rest = restPose.get(node.name);
      if (!rest) return;

      node.position.copy(rest.position);
      node.quaternion.copy(rest.quaternion);
      node.scale.copy(rest.scale);
    });
  }

  object.updateMatrixWorld(true);

  object.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) {
      node.skeleton.update();
    }
  });
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

    const parentWorldMatrix =
      node.parent?.matrixWorld?.clone() ||
      new THREE.Matrix4();

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
      parentWorldMatrix,
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
    parentWorldMatrix:
      entry.parentWorldMatrix?.clone() ||
      new THREE.Matrix4(),
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

function collectTargetSkinHierarchy(root) {
  const weighted = new Set();
  const fallback = new Set();
  const allBones = new Map();

  root?.traverse((node) => {
    if (node.isBone && node.name && !allBones.has(node.name)) {
      allBones.set(node.name, node);
    }

    if (!node.isSkinnedMesh || !node.skeleton) return;

    const bones = node.skeleton.bones || [];
    for (const bone of bones) {
      if (bone?.name) fallback.add(bone.name);
    }

    const skinIndex = node.geometry?.getAttribute?.('skinIndex');
    const skinWeight = node.geometry?.getAttribute?.('skinWeight');

    if (!skinIndex || !skinWeight) return;

    const indexArray = skinIndex.array;
    const weightArray = skinWeight.array;
    const count = Math.min(indexArray.length, weightArray.length);

    for (let i = 0; i < count; i++) {
      if (Number(weightArray[i]) <= 1e-6) continue;

      const boneIndex = Number(indexArray[i]) | 0;
      const bone = bones[boneIndex];

      if (bone?.name) weighted.add(bone.name);
    }
  });

  if (!weighted.size) {
    for (const name of fallback) weighted.add(name);
  }

  const influential = new Set(weighted);

  // Non-weighted root/pelvis/structural bones still matter when weighted
  // descendants inherit from them. These are valid animation carriers in FBX.
  for (const name of weighted) {
    let bone = allBones.get(name) || null;
    while (bone) {
      if (bone.isBone && bone.name) influential.add(bone.name);
      bone = bone.parent?.isBone ? bone.parent : null;
    }
  }

  return { weighted, influential };
}

function countWeightedDescendants(bone, weightedTargetBones) {
  if (!bone) return 0;

  let count = weightedTargetBones.has(bone.name) ? 1 : 0;
  bone.traverse?.((node) => {
    if (node !== bone && node.isBone && weightedTargetBones.has(node.name)) {
      count += 1;
    }
  });

  return count;
}


function isBlenderControlBoneName(name) {
  const raw = String(name || '').toLowerCase();

  // Keep plain "root" / "master" as structural carriers. Prefix families
  // below are control-rig conventions from CloudRig/Rigify/ARP exports.
  return (
    /^(fk|ik|mch|org|ctrl|str|p-str|hng|snap|line|dsp|scale)[-_:]/.test(raw) ||
    /^(hip|torso)[-_:]/.test(raw) ||
    /(^|[-_:])(pole|target|control)([-_:]|$)/.test(raw)
  );
}

function resolveBrowserBakeTarget({
  requestedName,
  pair,
  targetBones,
  weightedTargetBones,
  influentialTargetBones,
}) {
  if (
    !requestedName ||
    !targetBones?.has(requestedName) ||
    !weightedTargetBones?.size
  ) {
    return requestedName;
  }

  const requestedBone = targetBones.get(requestedName);
  const requestedCompact =
    normalizeExactBoneName(requestedName);

  const controlLike =
    isBlenderControlBoneName(requestedName);

  // Real deform bones and structural FBX carriers can be keyed directly.
  // Blender-style controls (FK-/IK-/HIP-/TORSO-/STR-/P-/HNG...) must be
  // redirected even when they appear in the exported hierarchy, because their
  // constraint graph is not evaluated by Three.js.
  if (
    influentialTargetBones?.has(requestedName) &&
    !controlLike
  ) {
    return requestedName;
  }

  let wantedSemantic = semanticBoneKey(requestedName);

  // CloudRig's Blender controls rely on constraints. In the browser we bake
  // straight to the corresponding deform role.
  if (/hipspine/.test(requestedCompact)) {
    wantedSemantic = 'hips';
  } else if (
    /torsospine/.test(requestedCompact) &&
    hasLocationChannel(pair.channels)
  ) {
    wantedSemantic = 'hips';
  }

  // BlendCap's CloudRig locomotion split is intentional:
  //   Hips -> root        LOC XY  = global ground travel
  //   Hips -> TORSO-Spine LOC Z   = pelvis/torso height
  //   Hips -> HIP-Spine   ROT     = pelvis orientation
  //
  // In Blender the controls drive deform bones through constraints. In the
  // browser we reproduce the RESULT directly on the deform hierarchy.
  if (
    hasLocationChannel(pair.channels) &&
    wantedSemantic === 'root'
  ) {
    const motionRoot =
      findTargetMotionCarrier(
        targetBones,
        weightedTargetBones,
        influentialTargetBones
      );

    if (motionRoot) return motionRoot;
  }

  const requestedPos = new THREE.Vector3();
  requestedBone.getWorldPosition(requestedPos);

  const candidates = [];

  for (const name of weightedTargetBones) {
    const bone = targetBones.get(name);
    if (!bone) continue;

    const semantic = semanticBoneKey(name);

    const spineFamily =
      ['hips', 'spine', 'spine1', 'spine2', 'spine3', 'chest'];

    const semanticMatch =
      semantic === wantedSemantic ||
      (
        spineFamily.includes(wantedSemantic) &&
        spineFamily.includes(semantic) &&
        (
          /hipspine|torsospine/.test(requestedCompact)
        )
      );

    if (!semanticMatch) continue;

    const pos = new THREE.Vector3();
    bone.getWorldPosition(pos);

    let score = 0;
    const lower = name.toLowerCase();

    if (/^def[-_:]?/.test(lower)) score += 240;
    if (/deform/.test(lower)) score += 120;
    if (/pelvis|hips/.test(lower) && wantedSemantic === 'hips') score += 220;

    if (isBlenderControlBoneName(name)) score -= 500;
    if (/^fk[-_:]?/.test(lower)) score -= 160;

    if (
      /(mch|org|ctrl|control|pole|target|ik[-_:]|hng|hanger|twist|tweak|roll)/
        .test(lower)
    ) {
      score -= 220;
    }

    // Same anatomical role wins. Rest-position proximity separates multiple
    // spine levels while preserving custom rig naming.
    if (semantic === wantedSemantic) score += 180;
    score -= requestedPos.distanceTo(pos);

    candidates.push({ name, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.name || requestedName;
}

function findTargetMotionCarrier(
  targetBones,
  weightedTargetBones,
  influentialTargetBones
) {
  const candidates = [...(influentialTargetBones || [])]
    .map((name) => targetBones.get(name))
    .filter(Boolean);

  if (!candidates.length) return '';

  const scored = candidates.map((bone) => {
    const semantic = semanticBoneKey(bone.name);
    const lower = bone.name.toLowerCase();
    const coverage = countWeightedDescendants(
      bone,
      weightedTargetBones
    );

    let score = coverage * 1000;

    if (semantic === 'root') score += 350;
    if (semantic === 'hips') score += 300;
    if (/pelvis|hips/.test(lower)) score += 220;
    if (/root|master/.test(lower)) score += 180;

    if (
      /(finger|thumb|index|middle|ring|pinky|toe|hand|foot|forearm|upperarm|thigh|shin|knee)/
        .test(lower)
    ) {
      score -= 5000;
    }

    // Prefer shallower carriers when coverage is equal.
    score -= boneDepth(bone) * 10;

    return { name: bone.name, score, coverage };
  });

  scored.sort((a, b) =>
    b.score - a.score ||
    b.coverage - a.coverage ||
    String(a.name).localeCompare(String(b.name))
  );

  return scored[0]?.name || '';
}


function blenderAxesToThreeWorld(value) {
  // BlendCap presets are authored in Blender world axes (Z-up):
  // Blender X -> Three X
  // Blender Y -> Three Z
  // Blender Z -> Three Y
  const axes = normalizeAxes(value);
  let out = '';

  if (axes.includes('X')) out += 'X';
  if (axes.includes('Z')) out += 'Y';
  if (axes.includes('Y')) out += 'Z';

  return normalizeAxes(out);
}

function computeRigHeightFromPose(pose, includedNames = null) {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [name, entry] of pose) {
    if (includedNames && !includedNames.has(name)) continue;

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

  let probe = raw
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/^(def|org|mch|ctrl)[-_:]/, '');

  const compact = probe.replace(/[^a-z0-9]/g, '');

  const explicitLeft =
    /(^|[._:\-])left([._:\-]|$)|(^|[._:\-])l([._:\-]|$)|\.l$|_l$|^left/.test(probe);
  const explicitRight =
    /(^|[._:\-])right([._:\-]|$)|(^|[._:\-])r([._:\-]|$)|\.r$|_r$|^right/.test(probe);

  const anatomicalStem =
    '(?:shoulder|clavicle|upperarm|forearm|lowerarm|arm|hand|wrist|' +
    'thumb\\d*|index\\d*|middle\\d*|ring\\d*|pinky\\d*|little\\d*|' +
    'finger[a-z0-9]*|upperleg|thigh|lowerleg|leg|calf|shin|knee|foot|ankle|' +
    'toe(?:base)?|toes)';

  const sanitizedLeft = new RegExp(anatomicalStem + 'l$').test(compact);
  const sanitizedRight = new RegExp(anatomicalStem + 'r$').test(compact);

  const side = explicitLeft || sanitizedLeft
    ? 'left'
    : explicitRight || sanitizedRight
      ? 'right'
      : '';

  probe = probe
    .replace(/\.l$|\.r$|_l$|_r$/g, '')
    .replace(/left|right/g, '');

  if (sanitizedLeft || sanitizedRight) {
    probe = probe.replace(/[lr]$/, '');
  }

  raw = probe.replace(/[^a-z0-9]/g, '');

  const fingerMatch = raw.match(/(?:finger)?(thumb|index|middle|ring|pinky|little)(?:finger)?0*([123])/)
    || raw.match(/(thumb|index|middle|ring|pinky|little)(?:finger)?0*([123])/);
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
