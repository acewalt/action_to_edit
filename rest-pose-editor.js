import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export class RestPoseEditor {
  constructor(container, {
    onBoneSelected = null,
    onPoseChanged = null,
  } = {}) {
    if (!container) throw new Error('RestPoseEditor requiere un contenedor.');

    this.container = container;
    this.onBoneSelected = onBoneSelected;
    this.onPoseChanged = onPoseChanged;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e12);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.001, 100000);
    this.camera.position.set(3.2, 2.2, 5.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0b0e12, 1);
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.target.set(0, 1, 0);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setMode('rotate');
    this.transform.setSpace('local');
    this.transform.size = 0.75;
    this.scene.add(this.transform.getHelper());

    this.transform.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      this.transformDragging = Boolean(event.value);
      if (!event.value) {
        this.updateMarkers();
        this.onPoseChanged?.(this.capturePose());
      }
    });

    this.transform.addEventListener('objectChange', () => {
      this.sourceRoot?.updateMatrixWorld(true);
      this.updateMarkers();
    });

    this.sourceGroup = new THREE.Group();
    this.sourceGroup.name = '__RestPoseSourceDisplay__';
    this.targetGroup = new THREE.Group();
    this.targetGroup.name = '__RestPoseTargetDisplay__';
    this.markerGroup = new THREE.Group();
    this.markerGroup.name = '__RestPoseBoneMarkers__';

    this.scene.add(this.sourceGroup, this.targetGroup, this.markerGroup);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1c222a, 2.0);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(4, 7, 5);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x9fb8ff, 0.75);
    rim.position.set(-4, 3, -5);
    this.scene.add(rim);

    this.grid = new THREE.GridHelper(20, 20, 0x303944, 0x1c232b);
    this.scene.add(this.grid);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.sourceRoot = null;
    this.targetRoot = null;
    this.sourceAsset = null;
    this.targetAsset = null;
    this.sourceBones = new Map();
    this.targetBones = new Map();
    this.markers = [];
    this.selectedBoneName = '';
    this.sourceVisible = true;
    this.targetVisible = true;
    this.meshesVisible = true;
    this.autoScale = true;
    this.displayScaleRatio = 1;
    this.transformDragging = false;
    this.disposed = false;

    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.transformDragging) return;
      this.pickBone(event);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this.animate = this.animate.bind(this);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  setAssets({
    sourceAsset,
    targetAsset,
    autoScale = true,
    poseOverride = null,
  }) {
    this.sourceAsset = sourceAsset || null;
    this.targetAsset = targetAsset || null;
    this.autoScale = Boolean(autoScale);

    this.clearDisplay();

    if (!sourceAsset?.object || !targetAsset?.object) {
      return;
    }

    this.sourceRoot = SkeletonUtils.clone(sourceAsset.object);
    this.targetRoot = SkeletonUtils.clone(targetAsset.object);

    applyRestPose(this.sourceRoot, sourceAsset.restPose);
    applyRestPose(this.targetRoot, targetAsset.restPose);

    if (poseOverride) {
      applyBonePoseOverride(this.sourceRoot, poseOverride);
    }

    cloneMaterialsForPreview(this.sourceRoot, {
      opacity: 0.58,
      wireframe: false,
      depthWrite: true,
    });

    cloneMaterialsForPreview(this.targetRoot, {
      opacity: 0.26,
      wireframe: true,
      depthWrite: false,
    });

    this.sourceGroup.add(this.sourceRoot);
    this.targetGroup.add(this.targetRoot);

    this.sourceBones = collectBones(this.sourceRoot);
    this.targetBones = collectBones(this.targetRoot);

    this.sourceHelper = new THREE.SkeletonHelper(this.sourceRoot);
    this.sourceHelper.material.color.setHex(0x9ecbff);
    this.sourceHelper.material.depthTest = false;
    this.sourceHelper.renderOrder = 20;
    this.scene.add(this.sourceHelper);

    this.targetHelper = new THREE.SkeletonHelper(this.targetRoot);
    this.targetHelper.material.color.setHex(0xffce78);
    this.targetHelper.material.transparent = true;
    this.targetHelper.material.opacity = 0.72;
    this.targetHelper.material.depthTest = false;
    this.targetHelper.renderOrder = 19;
    this.scene.add(this.targetHelper);

    this.alignForComparison();
    this.buildMarkers();
    this.setVisibility({
      source: this.sourceVisible,
      target: this.targetVisible,
      meshes: this.meshesVisible,
    });

    const preferred =
      this.selectedBoneName && this.sourceBones.has(this.selectedBoneName)
        ? this.selectedBoneName
        : this.guessFirstEditableBone();

    if (preferred) this.selectBone(preferred);
    this.fit();
  }

  clearDisplay() {
    this.transform.detach();
    this.clearMarkers();

    if (this.sourceHelper) {
      this.scene.remove(this.sourceHelper);
      this.sourceHelper.dispose?.();
      this.sourceHelper = null;
    }
    if (this.targetHelper) {
      this.scene.remove(this.targetHelper);
      this.targetHelper.dispose?.();
      this.targetHelper = null;
    }

    if (this.sourceRoot) {
      disposePreviewClone(this.sourceRoot);
      this.sourceRoot = null;
    }
    if (this.targetRoot) {
      disposePreviewClone(this.targetRoot);
      this.targetRoot = null;
    }

    this.sourceGroup.clear();
    this.targetGroup.clear();
    this.sourceGroup.position.set(0, 0, 0);
    this.sourceGroup.scale.set(1, 1, 1);
    this.targetGroup.position.set(0, 0, 0);
    this.targetGroup.scale.set(1, 1, 1);

    this.sourceBones = new Map();
    this.targetBones = new Map();
  }

  alignForComparison() {
    if (!this.sourceRoot || !this.targetRoot) return;

    this.sourceGroup.position.set(0, 0, 0);
    this.sourceGroup.scale.set(1, 1, 1);
    this.targetGroup.position.set(0, 0, 0);
    this.targetGroup.scale.set(1, 1, 1);

    this.sourceGroup.updateMatrixWorld(true);
    this.targetGroup.updateMatrixWorld(true);

    const sourceHeight = computeBoneHeight(this.sourceBones);
    const targetHeight = computeBoneHeight(this.targetBones);

    this.displayScaleRatio =
      this.autoScale && sourceHeight > 1e-8 && targetHeight > 1e-8
        ? targetHeight / sourceHeight
        : 1;

    this.sourceGroup.scale.setScalar(this.displayScaleRatio);
    this.sourceGroup.updateMatrixWorld(true);
    this.targetGroup.updateMatrixWorld(true);

    const sourceBox = safeBoxFromObject(this.sourceRoot);
    const targetBox = safeBoxFromObject(this.targetRoot);

    if (!sourceBox || !targetBox) return;

    const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
    const targetCenter = targetBox.getCenter(new THREE.Vector3());

    this.sourceGroup.position.x += targetCenter.x - sourceCenter.x;
    this.sourceGroup.position.z += targetCenter.z - sourceCenter.z;
    this.sourceGroup.position.y += targetBox.min.y - sourceBox.min.y;

    this.sourceGroup.updateMatrixWorld(true);
  }

  setAutoScale(enabled) {
    this.autoScale = Boolean(enabled);
    if (!this.sourceRoot || !this.targetRoot) return;
    this.alignForComparison();
    this.updateMarkers();
    this.fit();
  }

  getSourceBoneNames() {
    return [...this.sourceBones.keys()];
  }

  setVisibility({ source, target, meshes } = {}) {
    if (typeof source === 'boolean') this.sourceVisible = source;
    if (typeof target === 'boolean') this.targetVisible = target;
    if (typeof meshes === 'boolean') this.meshesVisible = meshes;

    this.sourceGroup.visible = this.sourceVisible;
    this.targetGroup.visible = this.targetVisible;
    this.markerGroup.visible = this.sourceVisible;

    setMeshVisibility(this.sourceRoot, this.meshesVisible);
    setMeshVisibility(this.targetRoot, this.meshesVisible);

    if (this.sourceHelper) this.sourceHelper.visible = this.sourceVisible;
    if (this.targetHelper) this.targetHelper.visible = this.targetVisible;

    if (!this.sourceVisible) this.transform.detach();
    else if (this.selectedBoneName) this.selectBone(this.selectedBoneName);
  }

  setMode(mode) {
    const next = mode === 'translate' ? 'translate' : 'rotate';
    this.transform.setMode(next);
  }

  setSpace(space) {
    this.transform.setSpace(space === 'world' ? 'world' : 'local');
  }

  selectBone(name) {
    const bone = this.sourceBones.get(name);
    if (!bone) return false;

    this.selectedBoneName = name;
    this.transform.attach(bone);
    this.transform.visible = this.sourceVisible;

    for (const marker of this.markers) {
      const selected = marker.userData.boneName === name;
      marker.scale.setScalar(selected ? 1.7 : 1);
      marker.material.color.setHex(selected ? 0xffffff : 0x82bfff);
      marker.material.opacity = selected ? 1 : 0.72;
    }

    this.onBoneSelected?.(name);
    return true;
  }

  resetSelectedBone() {
    if (!this.selectedBoneName || !this.sourceAsset?.restPose || !this.sourceRoot) {
      return;
    }

    const bone = this.sourceBones.get(this.selectedBoneName);
    const rest = this.sourceAsset.restPose.get(this.selectedBoneName);
    if (!bone || !rest) return;

    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
    this.sourceRoot.updateMatrixWorld(true);
    this.updateMarkers();
    this.onPoseChanged?.(this.capturePose());
  }

  resetAll() {
    if (!this.sourceRoot || !this.sourceAsset?.restPose) return;
    applyRestPose(this.sourceRoot, this.sourceAsset.restPose);
    this.alignForComparison();
    this.updateMarkers();
    if (this.selectedBoneName) this.selectBone(this.selectedBoneName);
    this.onPoseChanged?.(this.capturePose());
  }

  capturePose() {
    const pose = {};
    if (!this.sourceRoot) return pose;

    this.sourceRoot.traverse((node) => {
      if (!node.isBone || !node.name) return;
      pose[node.name] = {
        position: node.position.toArray(),
        quaternion: node.quaternion.toArray(),
        scale: node.scale.toArray(),
      };
    });

    return pose;
  }

  applyPose(pose) {
    if (!this.sourceRoot || !pose) return;
    applyRestPose(this.sourceRoot, this.sourceAsset?.restPose);
    applyBonePoseOverride(this.sourceRoot, pose);
    this.alignForComparison();
    this.updateMarkers();
    if (this.selectedBoneName) this.selectBone(this.selectedBoneName);
  }

  buildMarkers() {
    this.clearMarkers();
    if (!this.sourceBones.size) return;

    const sourceHeight = Math.max(computeBoneHeight(this.sourceBones) * this.displayScaleRatio, 0.1);
    const radius = THREE.MathUtils.clamp(sourceHeight * 0.0075, 0.008, 0.06);
    const geometry = new THREE.SphereGeometry(radius, 10, 8);

    for (const [name, bone] of this.sourceBones) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x82bfff,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
      });

      const marker = new THREE.Mesh(geometry, material);
      marker.renderOrder = 30;
      marker.userData.boneName = name;
      marker.userData.bone = bone;
      this.markerGroup.add(marker);
      this.markers.push(marker);
    }

    this.markerGeometry = geometry;
    this.updateMarkers();
  }

  clearMarkers() {
    for (const marker of this.markers) {
      marker.material?.dispose?.();
    }
    this.markers = [];
    this.markerGroup.clear();
    this.markerGeometry?.dispose?.();
    this.markerGeometry = null;
  }

  updateMarkers() {
    const world = new THREE.Vector3();
    for (const marker of this.markers) {
      const bone = marker.userData.bone;
      if (!bone) continue;
      bone.getWorldPosition(world);
      marker.position.copy(world);
    }
  }

  pickBone(event) {
    if (!this.sourceVisible || !this.markers.length) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.markers, false);
    if (!hits.length) return;

    const name = hits[0].object.userData.boneName;
    if (name) this.selectBone(name);
  }

  fit() {
    if (!this.sourceRoot && !this.targetRoot) return;

    this.sourceGroup.updateMatrixWorld(true);
    this.targetGroup.updateMatrixWorld(true);

    const box = new THREE.Box3();
    let hasBox = false;

    for (const group of [this.sourceGroup, this.targetGroup]) {
      if (!group.visible) continue;
      const current = safeBoxFromObject(group);
      if (!current) continue;
      if (!hasBox) {
        box.copy(current);
        hasBox = true;
      } else {
        box.union(current);
      }
    }

    if (!hasBox || box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);

    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (maxDim * 0.68) / Math.tan(fov * 0.5);

    const direction = new THREE.Vector3(0.48, 0.2, 1).normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance * 1.4);
    this.camera.near = Math.max(distance / 1000, 0.001);
    this.camera.far = Math.max(distance * 50, 100);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.update();

    this.grid.position.y = box.min.y;
    this.grid.scale.setScalar(Math.max(maxDim / 10, 0.1));
  }

  guessFirstEditableBone() {
    const names = this.getSourceBoneNames();
    return (
      names.find((name) => /(^|[:_.-])hips?$/i.test(name)) ||
      names.find((name) => /spine/i.test(name)) ||
      names.find((name) => /upperarm|arm/i.test(name)) ||
      names[0] ||
      ''
    );
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);

    if (!this.container.offsetParent) return;

    this.controls.update();
    this.updateMarkers();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.transform.detach();
    this.transform.dispose?.();
    this.controls.dispose?.();
    this.clearDisplay();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function collectBones(root) {
  const map = new Map();
  root?.traverse((node) => {
    if (node.isBone && node.name && !map.has(node.name)) {
      map.set(node.name, node);
    }
  });
  return map;
}

function applyRestPose(object, restPose) {
  if (!object || !restPose) return;

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

function applyBonePoseOverride(root, override) {
  if (!root || !override) return;

  const entries = override instanceof Map
    ? override
    : new Map(Object.entries(override));

  root.traverse((node) => {
    if (!node.isBone || !node.name) return;
    const value = entries.get(node.name);
    if (!value) return;

    if (value.position) {
      if (Array.isArray(value.position)) node.position.fromArray(value.position);
      else node.position.set(value.position.x || 0, value.position.y || 0, value.position.z || 0);
    }

    if (value.quaternion) {
      if (Array.isArray(value.quaternion)) node.quaternion.fromArray(value.quaternion);
      else node.quaternion.set(
        value.quaternion.x || 0,
        value.quaternion.y || 0,
        value.quaternion.z || 0,
        Number.isFinite(Number(value.quaternion.w)) ? Number(value.quaternion.w) : 1
      );
      node.quaternion.normalize();
    }

    if (value.scale) {
      if (Array.isArray(value.scale)) node.scale.fromArray(value.scale);
      else node.scale.set(
        Number.isFinite(Number(value.scale.x)) ? Number(value.scale.x) : 1,
        Number.isFinite(Number(value.scale.y)) ? Number(value.scale.y) : 1,
        Number.isFinite(Number(value.scale.z)) ? Number(value.scale.z) : 1
      );
    }
  });

  root.updateMatrixWorld(true);
}

function computeBoneHeight(bones) {
  if (!bones?.size) return 0;

  let minY = Infinity;
  let maxY = -Infinity;
  const point = new THREE.Vector3();

  for (const bone of bones.values()) {
    bone.getWorldPosition(point);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const height = maxY - minY;
  return Number.isFinite(height) ? height : 0;
}

function cloneMaterialsForPreview(root, {
  opacity = 1,
  wireframe = false,
  depthWrite = true,
} = {}) {
  root?.traverse((node) => {
    if (!node.isMesh) return;

    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];

    const clones = materials.map((material) => {
      if (!material?.clone) return material;
      const copy = material.clone();
      copy.transparent = opacity < 0.999 || copy.transparent;
      copy.opacity = opacity;
      copy.depthWrite = depthWrite;
      if ('wireframe' in copy) copy.wireframe = wireframe;
      return copy;
    });

    node.material = Array.isArray(node.material) ? clones : clones[0];
    node.frustumCulled = false;
  });
}

function setMeshVisibility(root, visible) {
  root?.traverse((node) => {
    if (node.isMesh) node.visible = Boolean(visible);
  });
}

function safeBoxFromObject(object) {
  if (!object) return null;
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return null;

  const values = [
    box.min.x, box.min.y, box.min.z,
    box.max.x, box.max.y, box.max.z,
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;
  return box;
}

function disposePreviewClone(root) {
  root?.traverse((node) => {
    if (!node.isMesh) return;

    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];

    materials.forEach((material) => material?.dispose?.());
  });
}
