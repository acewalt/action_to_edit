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

    this.perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.001, 100000);
    this.perspectiveCamera.position.set(3.2, 2.2, 5.4);

    this.orthographicCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.001, 100000);
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);

    this.camera = this.perspectiveCamera;
    this.projectionMode = 'perspective';
    this.freeProjectionMode = 'perspective';
    this.orthoViewHeight = 4;
    this.axisViewActive = false;
    this.axisViewReturnMode = 'perspective';
    this.axisViewQuaternion = null;
    this.axisSnapDrag = null;

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
    this.controls.zoomToCursor = false;
    this.controls.target.set(0, 1, 0);
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = null;

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setMode('rotate');
    this.transform.setSpace('local');
    this.transform.size = 0.72;
    this.scene.add(this.transform.getHelper());

    if (typeof this.transform.setColors === 'function') {
      this.transform.setColors(
        0xff3b4f,
        0x42d66b,
        0x3f7cff,
        0xffd84a
      );
    }

    this.transform.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      this.transformDragging = Boolean(event.value);

      if (!event.value) {
        this.sourceRoot?.updateMatrixWorld(true);
        this.updateSkeletonLines();
        this.updateMarkers();
        this.onPoseChanged?.(this.capturePose());
      }
    });

    this.transform.addEventListener('objectChange', () => {
      this.sourceRoot?.updateMatrixWorld(true);
      this.updateSkeletonLines();
      this.updateMarkers();
    });

    this.sourceGroup = new THREE.Group();
    this.sourceGroup.name = '__RestPoseSourceDisplay__';

    this.targetGroup = new THREE.Group();
    this.targetGroup.name = '__RestPoseTargetDisplay__';

    this.markerGroup = new THREE.Group();
    this.markerGroup.name = '__RestPoseBoneMarkers__';

    this.poseHandleGroup = new THREE.Group();
    this.poseHandleGroup.name = '__RestPoseLargeControls__';

    this.scene.add(
      this.sourceGroup,
      this.targetGroup,
      this.markerGroup,
      this.poseHandleGroup
    );

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
    this.sourceRestWorldQuaternions = new Map();

    this.sourceSkeletonView = null;
    this.targetSkeletonView = null;

    this.markers = [];
    this.poseHandles = [];
    this.selectedBoneName = '';

    this.sourceVisible = true;
    this.targetVisible = true;
    this.meshesVisible = true;
    this.autoScale = true;
    this.displayScaleRatio = 1;

    this.transformDragging = false;
    this.disposed = false;

    this.createNavigationUi();
    this.installNavigationEvents();

    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      if (
        event.button !== 0 ||
        this.transformDragging ||
        this.transform.axis
      ) {
        return;
      }

      this.pickBone(event);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this.animate = this.animate.bind(this);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  createNavigationUi() {
    this.navRoot = document.createElement('div');
    this.navRoot.className = 'rest-pose-navigation';

    this.projectionButton = document.createElement('button');
    this.projectionButton.type = 'button';
    this.projectionButton.className = 'rest-pose-projection-button';
    this.projectionButton.textContent = 'Perspectiva';
    this.projectionButton.title = 'Alternar Perspectiva / Ortográfica';

    this.gizmo = document.createElement('div');
    this.gizmo.className = 'rest-pose-view-gizmo';

    this.gizmoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.gizmoSvg.setAttribute('viewBox', '0 0 86 86');
    this.gizmoSvg.classList.add('rest-pose-view-gizmo-lines');

    this.axisLines = {};
    for (const key of ['+x', '-x', '+y', '-y', '+z', '-z']) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '43');
      line.setAttribute('y1', '43');
      line.setAttribute('x2', '43');
      line.setAttribute('y2', '43');
      line.dataset.axis = key;
      this.gizmoSvg.appendChild(line);
      this.axisLines[key] = line;
    }

    this.gizmo.appendChild(this.gizmoSvg);

    const center = document.createElement('span');
    center.className = 'rest-pose-view-center';
    this.gizmo.appendChild(center);

    this.axisButtons = [];

    const defs = [
      ['+x', 'X', 'x'],
      ['-x', '', 'x neg'],
      ['+y', 'Y', 'y'],
      ['-y', '', 'y neg'],
      ['+z', 'Z', 'z'],
      ['-z', '', 'z neg'],
    ];

    for (const [axis, label, cls] of defs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rest-pose-axis-button ' + cls;
      button.dataset.axisView = axis;
      button.textContent = label;
      button.title = 'Vista ' + axis + ' ortográfica';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.switchToAxisView(axis);
      });
      this.gizmo.appendChild(button);
      this.axisButtons.push(button);
    }

    this.projectionButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const next =
        this.freeProjectionMode === 'perspective'
          ? 'orthographic'
          : 'perspective';

      this.freeProjectionMode = next;
      this.axisViewActive = false;
      this.axisViewQuaternion = null;
      this.setActiveCamera(next, { preserveView: true });
      this.updateProjectionButton();
    });

    this.navRoot.append(this.projectionButton, this.gizmo);
    this.container.appendChild(this.navRoot);

    this.updateProjectionButton();
  }

  installNavigationEvents() {
    this.onNavigationPointerDown = (event) => {
      if (
        event.pointerType === 'touch' ||
        event.button !== 1 ||
        this.transformDragging
      ) {
        return;
      }

      event.preventDefault();

      if (event.altKey) {
        event.stopImmediatePropagation();
        this.beginAxisSnap(event);
        return;
      }

      const isOrbitGesture =
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey;

      if (this.axisViewActive && isOrbitGesture) {
        const returnMode = this.freeProjectionMode;
        this.axisViewActive = false;
        this.axisViewQuaternion = null;

        if (
          returnMode === 'perspective' &&
          this.camera.isOrthographicCamera
        ) {
          this.setActiveCamera('perspective', { preserveView: true });
        } else if (
          returnMode === 'orthographic' &&
          this.camera.isPerspectiveCamera
        ) {
          this.setActiveCamera('orthographic', { preserveView: true });
        }
      }

      this.controls.mouseButtons.MIDDLE =
        (event.ctrlKey || event.metaKey)
          ? THREE.MOUSE.DOLLY
          : THREE.MOUSE.ROTATE;
    };

    this.onNavigationPointerMove = (event) => {
      if (!this.axisSnapDrag) return;
      event.preventDefault();
      this.updateAxisSnap(event);
    };

    this.onNavigationPointerUp = (event) => {
      if (this.axisSnapDrag) {
        this.endAxisSnap(event);
      }

      this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    };

    this.onAuxClick = (event) => {
      if (event.button === 1) event.preventDefault();
    };

    this.renderer.domElement.addEventListener(
      'pointerdown',
      this.onNavigationPointerDown,
      { capture: true }
    );

    this.renderer.domElement.addEventListener(
      'auxclick',
      this.onAuxClick
    );

    window.addEventListener(
      'pointermove',
      this.onNavigationPointerMove,
      { passive: false }
    );

    window.addEventListener(
      'pointerup',
      this.onNavigationPointerUp
    );

    window.addEventListener(
      'pointercancel',
      this.onNavigationPointerUp
    );
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

    // This editor is intentionally STATIC. It never creates an AnimationMixer
    // and it always restores the imported rest transforms before editing.
    this.sourceRoot.animations = [];
    this.targetRoot.animations = [];

    restoreAssetRest(this.sourceRoot, sourceAsset);
    restoreAssetRest(this.targetRoot, targetAsset);

    prepareRestPoseMeshes(this.sourceRoot);
    prepareRestPoseMeshes(this.targetRoot);

    this.sourceGroup.add(this.sourceRoot);
    this.targetGroup.add(this.targetRoot);

    this.sourceBones = collectBones(this.sourceRoot);
    this.targetBones = collectBones(this.targetRoot);

    this.sourceGroup.updateMatrixWorld(true);
    this.sourceRestWorldQuaternions =
      captureWorldQuaternions(this.sourceBones);

    if (poseOverride) {
      applyBonePoseOverride(this.sourceRoot, poseOverride);
    }

    cloneMaterialsForPreview(this.sourceRoot, {
      opacity: 0.96,
      wireframe: false,
      depthWrite: true,
      tint: 0xbfc3c8,
    });

    cloneMaterialsForPreview(this.targetRoot, {
      opacity: 0.58,
      wireframe: false,
      depthWrite: false,
      tint: 0x8f969e,
    });

    this.alignForComparison();

    this.sourceSkeletonView = createFilteredSkeletonView(
      this.sourceBones,
      0x78b9ff
    );
    this.targetSkeletonView = createFilteredSkeletonView(
      this.targetBones,
      0xffc45f
    );

    if (this.sourceSkeletonView?.line) {
      this.scene.add(this.sourceSkeletonView.line);
    }
    if (this.targetSkeletonView?.line) {
      this.scene.add(this.targetSkeletonView.line);
    }

    this.buildMarkers();
    this.buildPoseHandles();

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

    this.updateSkeletonLines();
    this.fit();
  }

  clearDisplay() {
    this.transform.detach();
    this.clearMarkers();
    this.clearPoseHandles();

    if (this.sourceSkeletonView?.line) {
      this.scene.remove(this.sourceSkeletonView.line);
      this.sourceSkeletonView.line.geometry.dispose();
      this.sourceSkeletonView.line.material.dispose();
    }

    if (this.targetSkeletonView?.line) {
      this.scene.remove(this.targetSkeletonView.line);
      this.targetSkeletonView.line.geometry.dispose();
      this.targetSkeletonView.line.material.dispose();
    }

    this.sourceSkeletonView = null;
    this.targetSkeletonView = null;

    if (this.sourceRoot) {
      disposePreviewClone(this.sourceRoot);
      this.sourceRoot.removeFromParent();
      this.sourceRoot = null;
    }

    if (this.targetRoot) {
      disposePreviewClone(this.targetRoot);
      this.targetRoot.removeFromParent();
      this.targetRoot = null;
    }

    this.sourceGroup.clear();
    this.targetGroup.clear();

    this.sourceGroup.position.set(0, 0, 0);
    this.sourceGroup.quaternion.identity();
    this.sourceGroup.scale.set(1, 1, 1);

    this.targetGroup.position.set(0, 0, 0);
    this.targetGroup.quaternion.identity();
    this.targetGroup.scale.set(1, 1, 1);

    this.sourceBones = new Map();
    this.targetBones = new Map();
    this.sourceRestWorldQuaternions = new Map();
  }

  alignForComparison() {
    if (!this.sourceRoot || !this.targetRoot) return;

    this.sourceGroup.position.set(0, 0, 0);
    this.sourceGroup.quaternion.identity();
    this.sourceGroup.scale.set(1, 1, 1);

    this.targetGroup.position.set(0, 0, 0);
    this.targetGroup.quaternion.identity();
    this.targetGroup.scale.set(1, 1, 1);

    this.sourceGroup.updateMatrixWorld(true);
    this.targetGroup.updateMatrixWorld(true);

    // IMPORTANT: Auto-scale to Target belongs to the RETARGET BAKE. It should
    // not visually rescale the characters in Redefine Rest Pose. This viewport
    // preserves each FBX's real imported proportions so a child rig remains
    // smaller than an adult rig, exactly like in Blender.
    this.displayScaleRatio = 1;

    const sourceSet = chooseDisplayBoneSet(this.sourceBones);
    const targetSet = chooseDisplayBoneSet(this.targetBones);

    let sourceBox = boxFromBones(this.sourceBones, sourceSet);
    let targetBox = boxFromBones(this.targetBones, targetSet);

    if (!sourceBox || !targetBox) return;

    // Put both rigs upright on the same floor and side-by-side. This keeps
    // their original scale while making the rest poses easy to compare.
    this.sourceGroup.position.y -= sourceBox.min.y;
    this.targetGroup.position.y -= targetBox.min.y;

    this.sourceGroup.updateMatrixWorld(true);
    this.targetGroup.updateMatrixWorld(true);

    sourceBox = boxFromBones(this.sourceBones, sourceSet);
    targetBox = boxFromBones(this.targetBones, targetSet);

    const sourceHeight = Math.max(sourceBox.max.y - sourceBox.min.y, 0.001);
    const targetHeight = Math.max(targetBox.max.y - targetBox.min.y, 0.001);
    const maxHeight = Math.max(sourceHeight, targetHeight);

    const gap = maxHeight * 0.18;

    // Source on the left, Target on the right.
    this.sourceGroup.position.x += (-gap * 0.5) - sourceBox.max.x;
    this.targetGroup.position.x += ( gap * 0.5) - targetBox.min.x;

    // Center both rigs on depth so they are directly comparable from front view.
    this.sourceGroup.position.z -= (sourceBox.min.z + sourceBox.max.z) * 0.5;
    this.targetGroup.position.z -= (targetBox.min.z + targetBox.max.z) * 0.5;

    this.sourceGroup.updateMatrixWorld(true);
    this.targetGroup.updateMatrixWorld(true);
  }

  setAutoScale(enabled) {
    this.autoScale = Boolean(enabled);
    // The checkbox still controls bake scaling in retargeting.js.
    // Redefine Rest Pose intentionally keeps original FBX proportions.
    if (!this.sourceRoot || !this.targetRoot) return;
    this.updateSkeletonLines();
    this.updateMarkers();
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
    this.poseHandleGroup.visible = this.sourceVisible;

    setMeshVisibility(this.sourceRoot, this.meshesVisible);
    setMeshVisibility(this.targetRoot, this.meshesVisible);

    if (this.sourceSkeletonView?.line) {
      this.sourceSkeletonView.line.visible = this.sourceVisible;
    }

    if (this.targetSkeletonView?.line) {
      this.targetSkeletonView.line.visible = this.targetVisible;
    }

    if (!this.sourceVisible) {
      this.transform.detach();
    } else if (this.selectedBoneName) {
      this.selectBone(this.selectedBoneName);
    }
  }

  setMode(mode) {
    this.transform.setMode(mode === 'translate' ? 'translate' : 'rotate');
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
      marker.scale.setScalar(selected ? 1.75 : 1);
      marker.material.color.setHex(selected ? 0xffffff : 0x82bfff);
      marker.material.opacity = selected ? 1 : 0.65;
    }

    for (const handle of this.poseHandles) {
      const selected = handle.userData.boneName === name;
      handle.material.color.setHex(selected ? 0xffffff : 0x6eaef2);
      handle.material.opacity = selected ? 0.95 : 0.45;
      handle.scale.setScalar(
        (handle.userData.baseScale || 1) * (selected ? 1.18 : 1)
      );
    }

    this.onBoneSelected?.(name);
    return true;
  }

  resetSelectedBone() {
    if (
      !this.selectedBoneName ||
      !this.sourceAsset?.restPose ||
      !this.sourceRoot
    ) {
      return;
    }

    const bone = this.sourceBones.get(this.selectedBoneName);
    const rest = this.sourceAsset.restPose.get(this.selectedBoneName);

    if (!bone || !rest) return;

    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);

    this.sourceRoot.updateMatrixWorld(true);
    this.updateSkeletonLines();
    this.updateMarkers();
    this.onPoseChanged?.(this.capturePose());
  }

  resetAll() {
    if (!this.sourceRoot || !this.sourceAsset?.restPose) return;

    restoreAssetRest(this.sourceRoot, this.sourceAsset);
    this.sourceRoot.updateMatrixWorld(true);

    this.updateSkeletonLines();
    this.updateMarkers();

    if (this.selectedBoneName) {
      this.selectBone(this.selectedBoneName);
    }

    this.onPoseChanged?.(this.capturePose());
  }

  copySelectedToOpposite() {
    const sourceName = this.selectedBoneName;
    if (!sourceName) {
      return {
        ok: false,
        message: 'Selecciona primero un hueso del Source.',
      };
    }

    const targetName = findOppositeBoneName(
      sourceName,
      [...this.sourceBones.keys()]
    );

    if (!targetName) {
      return {
        ok: false,
        message:
          'No se encontró un hueso opuesto para "' + sourceName + '".',
      };
    }

    const sourceBone = this.sourceBones.get(sourceName);
    const targetBone = this.sourceBones.get(targetName);

    const sourceRestWorld = this.sourceRestWorldQuaternions.get(sourceName);
    const targetRestWorld = this.sourceRestWorldQuaternions.get(targetName);

    if (
      !sourceBone ||
      !targetBone ||
      !sourceRestWorld ||
      !targetRestWorld
    ) {
      return {
        ok: false,
        message: 'No se pudo resolver el Rest de ambos huesos.',
      };
    }

    this.sourceRoot.updateMatrixWorld(true);

    const sourceCurrentWorld = new THREE.Quaternion();
    sourceBone.getWorldQuaternion(sourceCurrentWorld);

    const deltaWorld = sourceCurrentWorld
      .clone()
      .multiply(sourceRestWorld.clone().invert())
      .normalize();

    const deltaMatrix = new THREE.Matrix4().makeRotationFromQuaternion(
      deltaWorld
    );

    const mirrorX = new THREE.Matrix4().makeScale(-1, 1, 1);

    const mirroredMatrix = mirrorX
      .clone()
      .multiply(deltaMatrix)
      .multiply(mirrorX);

    const mirroredDelta = new THREE.Quaternion()
      .setFromRotationMatrix(mirroredMatrix)
      .normalize();

    const desiredTargetWorld = mirroredDelta
      .clone()
      .multiply(targetRestWorld)
      .normalize();

    const parentWorld = new THREE.Quaternion();
    if (targetBone.parent) {
      targetBone.parent.getWorldQuaternion(parentWorld);
    }

    targetBone.quaternion.copy(
      parentWorld
        .invert()
        .multiply(desiredTargetWorld)
        .normalize()
    );

    this.sourceRoot.updateMatrixWorld(true);
    this.updateSkeletonLines();
    this.updateMarkers();

    this.onPoseChanged?.(this.capturePose());

    return {
      ok: true,
      source: sourceName,
      target: targetName,
    };
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

    restoreAssetRest(this.sourceRoot, this.sourceAsset);
    applyBonePoseOverride(this.sourceRoot, pose);

    this.sourceRoot.updateMatrixWorld(true);
    this.updateSkeletonLines();
    this.updateMarkers();

    if (this.selectedBoneName) {
      this.selectBone(this.selectedBoneName);
    }
  }

  buildMarkers() {
    this.clearMarkers();
    if (!this.sourceBones.size) return;

    const sourceHeight = Math.max(
      computeBoneHeight(
        this.sourceBones,
        chooseDisplayBoneSet(this.sourceBones)
      ) * this.displayScaleRatio,
      0.1
    );

    const radius = THREE.MathUtils.clamp(
      sourceHeight * 0.005,
      0.006,
      0.045
    );

    const geometry = new THREE.SphereGeometry(radius, 9, 7);
    this.markerGeometry = geometry;

    for (const [name, bone] of this.sourceBones) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x82bfff,
        transparent: true,
        opacity: 0.65,
        depthTest: false,
      });

      const marker = new THREE.Mesh(geometry, material);
      marker.renderOrder = 30;
      marker.userData.boneName = name;
      marker.userData.bone = bone;

      this.markerGroup.add(marker);
      this.markers.push(marker);
    }

    this.updateMarkers();
  }

  buildPoseHandles() {
    this.clearPoseHandles();
    if (!this.sourceBones.size) return;

    const sourceHeight = Math.max(
      computeBoneHeight(
        this.sourceBones,
        chooseDisplayBoneSet(this.sourceBones)
      ) * this.displayScaleRatio,
      0.1
    );

    const geometry = new THREE.TorusGeometry(1, 0.085, 10, 48);
    this.poseHandleGeometry = geometry;

    const candidates = choosePoseHandleBones(this.sourceBones);

    for (const bone of candidates) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x6eaef2,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        side: THREE.DoubleSide,
      });

      const handle = new THREE.Mesh(geometry, material);
      const semantic = semanticNameForHandle(bone.name);

      let scale = sourceHeight * 0.072;
      if (/hips|spine|chest|head|neck/.test(semantic)) {
        scale *= 1.35;
      } else if (/hand|foot/.test(semantic)) {
        scale *= 0.72;
      }

      scale = THREE.MathUtils.clamp(scale, 0.035, 0.24);

      handle.scale.setScalar(scale);
      handle.userData.baseScale = scale;
      handle.userData.boneName = bone.name;
      handle.userData.bone = bone;
      handle.userData.semantic = semantic;
      handle.renderOrder = 80;

      this.poseHandleGroup.add(handle);
      this.poseHandles.push(handle);
    }

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

  clearPoseHandles() {
    for (const handle of this.poseHandles) {
      handle.material?.dispose?.();
    }

    this.poseHandles = [];
    this.poseHandleGroup.clear();
    this.poseHandleGeometry?.dispose?.();
    this.poseHandleGeometry = null;
  }

  updateMarkers() {
    const world = new THREE.Vector3();

    for (const marker of this.markers) {
      const bone = marker.userData.bone;
      if (!bone) continue;

      bone.getWorldPosition(world);
      marker.position.copy(world);
    }

    for (const handle of this.poseHandles) {
      const bone = handle.userData.bone;
      if (!bone) continue;

      getPoseHandleWorldPosition(handle, world);
      handle.position.copy(world);

      // Screen-facing rings behave like Blender custom-shape controls:
      // large, easy to see and easy to click from any viewing angle.
      handle.quaternion.copy(this.camera.quaternion);
    }
  }

  updateSkeletonLines() {
    updateFilteredSkeletonView(this.sourceSkeletonView);
    updateFilteredSkeletonView(this.targetSkeletonView);
  }

  pickBone(event) {
    if (!this.sourceVisible) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.pointer.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const pickables = [
      ...this.poseHandles,
      ...this.markers,
    ];

    const hits = this.raycaster.intersectObjects(pickables, false);
    if (!hits.length) return;

    const name = hits[0].object.userData.boneName;
    if (name) this.selectBone(name);
  }

  fit() {
    if (!this.sourceRoot && !this.targetRoot) return;

    // Same behavior as the main viewport's Encuadrar:
    // reset to a stable perspective navigation state first.
    this.freeProjectionMode = 'perspective';
    this.axisViewActive = false;
    this.axisViewQuaternion = null;
    this.setActiveCamera('perspective', { preserveView: false });

    this.sourceGroup.updateMatrixWorld(true);
    this.targetGroup.updateMatrixWorld(true);

    const box = new THREE.Box3();
    let hasBox = false;

    const visibleBoneSets = [
      [this.sourceVisible, this.sourceBones],
      [this.targetVisible, this.targetBones],
    ];

    for (const [visible, bones] of visibleBoneSets) {
      if (!visible || !bones?.size) continue;

      const current = boxFromBones(
        bones,
        chooseDisplayBoneSet(bones)
      );

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

    const fov = THREE.MathUtils.degToRad(this.perspectiveCamera.fov);
    const distance =
      (maxDim * 0.72) /
      Math.tan(fov * 0.5);

    const direction = new THREE.Vector3(0.32, 0.12, 1).normalize();

    this.perspectiveCamera.position
      .copy(center)
      .addScaledVector(direction, distance * 1.35);

    this.perspectiveCamera.up.set(0, 1, 0);
    this.perspectiveCamera.lookAt(center);
    this.perspectiveCamera.near = Math.max(distance / 5000, 0.001);
    this.perspectiveCamera.far = Math.max(distance * 100, 1000);
    this.perspectiveCamera.updateProjectionMatrix();
    this.perspectiveCamera.updateMatrixWorld(true);

    this.camera = this.perspectiveCamera;
    this.controls.object = this.camera;
    this.controls.target.copy(center);
    this.transform.camera = this.camera;
    this.flushControls();

    this.grid.position.y = box.min.y;
    this.grid.scale.setScalar(Math.max(maxDim / 10, 0.1));

    this.updateProjectionButton();
    this.updateNavigationGizmo();
  }

  setActiveCamera(mode, { preserveView = true } = {}) {
    const nextMode =
      mode === 'orthographic'
        ? 'orthographic'
        : 'perspective';

    if (this.projectionMode === nextMode && this.camera) {
      this.updateProjectionButton();
      return;
    }

    const previous = this.camera;
    const target = this.controls.target.clone();

    let direction = previous.position.clone().sub(target);
    if (direction.lengthSq() < 1e-10) {
      direction.set(0.32, 0.12, 1);
    }
    direction.normalize();

    if (nextMode === 'orthographic') {
      if (preserveView && previous.isPerspectiveCamera) {
        this.orthoViewHeight = this.perspectiveVisibleHeightAtTarget();
      }

      const distance = Math.max(
        previous.position.distanceTo(target),
        0.1
      );

      this.syncOrthographicFrustum(this.orthoViewHeight);
      this.orthographicCamera.zoom = 1;
      this.orthographicCamera.position
        .copy(target)
        .addScaledVector(direction, distance);
      this.orthographicCamera.up.copy(previous.up);
      this.orthographicCamera.lookAt(target);
      this.orthographicCamera.updateMatrixWorld(true);

      this.camera = this.orthographicCamera;
    } else {
      let visibleHeight = this.perspectiveVisibleHeightAtTarget();

      if (previous.isOrthographicCamera) {
        visibleHeight =
          this.orthoViewHeight /
          Math.max(previous.zoom || 1, 0.000001);
      }

      const halfFov =
        THREE.MathUtils.degToRad(this.perspectiveCamera.fov) * 0.5;

      const distance = Math.max(
        visibleHeight / (2 * Math.tan(halfFov)),
        0.1
      );

      direction = safePerspectiveDirection(direction);

      this.perspectiveCamera.up.set(0, 1, 0);
      this.perspectiveCamera.zoom = 1;
      this.perspectiveCamera.position
        .copy(target)
        .addScaledVector(direction, distance);
      this.perspectiveCamera.lookAt(target);
      this.perspectiveCamera.aspect = this.getAspect();
      this.perspectiveCamera.near = Math.max(distance / 5000, 0.001);
      this.perspectiveCamera.far = Math.max(distance * 100, 1000);
      this.perspectiveCamera.updateProjectionMatrix();
      this.perspectiveCamera.updateMatrixWorld(true);

      this.camera = this.perspectiveCamera;
      this.controls.minDistance = Math.max(distance * 0.02, 0.01);
      this.controls.maxDistance = Math.max(distance * 50, 100);
    }

    this.projectionMode = nextMode;
    this.controls.object = this.camera;
    this.controls.target.copy(target);
    this.transform.camera = this.camera;

    this.flushControls();
    this.updateProjectionButton();
  }

  switchToAxisView(axisView) {
    const def = axisViewDefinition(axisView);
    const target = this.controls.target.clone();

    this.axisViewReturnMode = this.freeProjectionMode;

    let distance = this.camera.position.distanceTo(target);
    if (!Number.isFinite(distance) || distance < 0.01) {
      distance = 5;
    }

    if (this.camera.isPerspectiveCamera) {
      this.orthoViewHeight = this.perspectiveVisibleHeightAtTarget();
    }

    this.setActiveCamera('orthographic', { preserveView: true });

    this.camera.position
      .copy(target)
      .addScaledVector(def.direction, distance);

    this.camera.up.copy(def.up);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);

    this.controls.object = this.camera;
    this.controls.target.copy(target);
    this.flushControls();

    this.axisViewQuaternion = this.camera.quaternion.clone();
    this.axisViewActive = true;

    this.updateNavigationGizmo();
  }

  beginAxisSnap(event) {
    const target = this.controls.target.clone();

    const startDirection =
      this.camera.position.clone().sub(target);

    if (startDirection.lengthSq() < 1e-10) {
      startDirection.set(0.32, 0.12, 1);
    }

    startDirection.normalize();

    const startRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.camera.quaternion)
      .normalize();

    this.axisSnapDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startDirection,
      startRight,
      lastAxis: null,
      moved: false,
    };

    this.controls.enabled = false;

    try {
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } catch {}
  }

  updateAxisSnap(event) {
    const drag = this.axisSnapDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (Math.hypot(dx, dy) < 10) return;

    drag.moved = true;

    const direction = virtualOrbitDirectionFromDrag(
      drag,
      dx,
      dy
    );

    const axis = nearestAxisViewFromDirection(direction);
    if (axis === drag.lastAxis) return;

    drag.lastAxis = axis;
    this.switchToAxisView(axis);
  }

  endAxisSnap(event) {
    const drag = this.axisSnapDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    this.axisSnapDrag = null;
    this.controls.enabled = true;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;

    try {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    } catch {}

    this.flushControls();
  }

  flushControls() {
    const damping = this.controls.enableDamping;

    this.controls.enableDamping = false;
    this.controls.update();

    this.controls.enableDamping = damping;
    this.controls.update();
  }

  getAspect() {
    return Math.max(
      this.container.clientWidth /
        Math.max(this.container.clientHeight, 1),
      0.05
    );
  }

  perspectiveVisibleHeightAtTarget() {
    const distance = Math.max(
      this.perspectiveCamera.position.distanceTo(
        this.controls.target
      ),
      0.001
    );

    return (
      2 *
      distance *
      Math.tan(
        THREE.MathUtils.degToRad(
          this.perspectiveCamera.fov
        ) * 0.5
      )
    );
  }

  syncOrthographicFrustum(viewHeight = this.orthoViewHeight) {
    const aspect = this.getAspect();

    this.orthoViewHeight = Math.max(
      Number(viewHeight) || 4,
      0.001
    );

    const halfH = this.orthoViewHeight * 0.5;
    const halfW = halfH * aspect;

    this.orthographicCamera.left = -halfW;
    this.orthographicCamera.right = halfW;
    this.orthographicCamera.top = halfH;
    this.orthographicCamera.bottom = -halfH;
    this.orthographicCamera.updateProjectionMatrix();
  }

  updateProjectionButton() {
    if (!this.projectionButton) return;

    this.projectionButton.textContent =
      this.freeProjectionMode === 'orthographic'
        ? 'Ortográfica'
        : 'Perspectiva';
  }

  updateNavigationGizmo() {
    if (!this.gizmo || !this.camera) return;

    const center = 43;
    const radius = 27;

    const inverseCameraQuat =
      this.camera.quaternion.clone().invert();

    const axes = [
      ['+x', new THREE.Vector3(1, 0, 0)],
      ['-x', new THREE.Vector3(-1, 0, 0)],
      ['+y', new THREE.Vector3(0, 1, 0)],
      ['-y', new THREE.Vector3(0, -1, 0)],
      ['+z', new THREE.Vector3(0, 0, 1)],
      ['-z', new THREE.Vector3(0, 0, -1)],
    ];

    for (const [axis, vector] of axes) {
      const v = vector
        .clone()
        .applyQuaternion(inverseCameraQuat);

      const x = center + v.x * radius;
      const y = center - v.y * radius;

      const button = this.axisButtons.find(
        (item) => item.dataset.axisView === axis
      );

      if (button) {
        button.style.left = x + 'px';
        button.style.top = y + 'px';
        button.style.zIndex = String(
          30 + Math.round((1 - v.z) * 10)
        );
        button.style.opacity = String(
          THREE.MathUtils.clamp(
            0.45 + (1 - v.z) * 0.4,
            0.35,
            1
          )
        );
      }

      const line = this.axisLines[axis];
      if (line) {
        line.setAttribute('x1', String(center));
        line.setAttribute('y1', String(center));
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(y));
      }
    }
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

    this.perspectiveCamera.aspect = width / height;
    this.perspectiveCamera.updateProjectionMatrix();

    this.syncOrthographicFrustum(this.orthoViewHeight);
  }

  animate() {
    if (this.disposed) return;

    this.animationFrame = requestAnimationFrame(this.animate);

    if (!this.container.offsetParent) return;

    this.controls.update();
    this.updateSkeletonLines();
    this.updateMarkers();
    this.updateNavigationGizmo();

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;

    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();

    this.renderer.domElement.removeEventListener(
      'pointerdown',
      this.onNavigationPointerDown,
      { capture: true }
    );

    this.renderer.domElement.removeEventListener(
      'auxclick',
      this.onAuxClick
    );

    window.removeEventListener(
      'pointermove',
      this.onNavigationPointerMove
    );

    window.removeEventListener(
      'pointerup',
      this.onNavigationPointerUp
    );

    window.removeEventListener(
      'pointercancel',
      this.onNavigationPointerUp
    );

    this.transform.detach();
    this.transform.dispose?.();
    this.controls.dispose?.();

    this.clearDisplay();

    this.navRoot?.remove();

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function collectBones(root) {
  const map = new Map();

  root?.traverse((node) => {
    if (
      node.isBone &&
      node.name &&
      !map.has(node.name)
    ) {
      map.set(node.name, node);
    }
  });

  return map;
}

function captureWorldQuaternions(bones) {
  const result = new Map();

  for (const [name, bone] of bones) {
    const q = new THREE.Quaternion();
    bone.getWorldQuaternion(q);
    result.set(name, q);
  }

  return result;
}

function restoreHierarchySnapshot(root, snapshot) {
  if (!root || !Array.isArray(snapshot) || !snapshot.length) return false;

  const nodes = [];
  root.traverse((node) => nodes.push(node));

  if (nodes.length !== snapshot.length) {
    return false;
  }

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

  // New imports use an exact traversal snapshot captured immediately after
  // FBXLoader parsing. This restores object/root rotations and scales as well
  // as bones, and avoids collisions from duplicate control names.
  if (restoreHierarchySnapshot(root, asset.restHierarchy)) {
    return;
  }

  // Backward-compatible fallback for assets imported before v39.
  applyRestPose(root, asset.restPose);
}

function applyRestPose(object, restPose) {
  if (!object) return;

  // A Source/Target asset may currently be animated in the main viewport.
  // Skeleton.pose() restores the bind pose independently of that live state.
  object.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) {
      node.skeleton.pose();
    }
  });

  // Only restore BONE transforms from the captured import pose.
  // Rest maps are name-based and complex Blender rigs can contain duplicate
  // object/control names; applying those transforms to meshes/helpers can
  // explode the preview scale. The armature/object transforms themselves are
  // already preserved by SkeletonUtils.clone().
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
      if (Array.isArray(value.position)) {
        node.position.fromArray(value.position);
      } else {
        node.position.set(
          Number(value.position.x) || 0,
          Number(value.position.y) || 0,
          Number(value.position.z) || 0
        );
      }
    }

    if (value.quaternion) {
      if (Array.isArray(value.quaternion)) {
        node.quaternion.fromArray(value.quaternion);
      } else {
        node.quaternion.set(
          Number(value.quaternion.x) || 0,
          Number(value.quaternion.y) || 0,
          Number(value.quaternion.z) || 0,
          Number.isFinite(Number(value.quaternion.w))
            ? Number(value.quaternion.w)
            : 1
        );
      }

      node.quaternion.normalize();
    }

    if (value.scale) {
      if (Array.isArray(value.scale)) {
        node.scale.fromArray(value.scale);
      } else {
        node.scale.set(
          Number.isFinite(Number(value.scale.x))
            ? Number(value.scale.x)
            : 1,
          Number.isFinite(Number(value.scale.y))
            ? Number(value.scale.y)
            : 1,
          Number.isFinite(Number(value.scale.z))
            ? Number(value.scale.z)
            : 1
        );
      }
    }
  });

  root.updateMatrixWorld(true);
}

function computeBoneHeight(bones, selected = null) {
  if (!bones?.size) return 0;

  let minY = Infinity;
  let maxY = -Infinity;

  const point = new THREE.Vector3();

  for (const [name, bone] of bones) {
    if (selected && !selected.has(name)) continue;

    bone.getWorldPosition(point);

    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const height = maxY - minY;
  return Number.isFinite(height) ? height : 0;
}

function boxFromBones(bones, selected = null) {
  if (!bones?.size) return null;

  const box = new THREE.Box3();
  box.makeEmpty();

  const point = new THREE.Vector3();
  let count = 0;

  for (const [name, bone] of bones) {
    if (selected && !selected.has(name)) continue;

    bone.getWorldPosition(point);
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      continue;
    }

    box.expandByPoint(point);
    count += 1;
  }

  return count && !box.isEmpty()
    ? box
    : null;
}

function cloneMaterialsForPreview(root, {
  opacity = 1,
  wireframe = false,
  depthWrite = true,
  tint = 0xffffff,
} = {}) {
  root?.traverse((node) => {
    if (!node.isMesh) return;

    const original = Array.isArray(node.material)
      ? node.material
      : [node.material];

    // Blender-like Solid display: never sample the FBX material, textures,
    // normal maps, metallic maps, etc. Keep only the number of material slots
    // so geometry groups continue to render correctly.
    const createSolid = () => new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.82,
      metalness: 0.0,
      transparent: opacity < 0.999,
      opacity,
      depthWrite,
      wireframe,
      side: THREE.DoubleSide,
    });

    const solids = original.map(() => createSolid());

    node.material = Array.isArray(node.material)
      ? solids
      : solids[0];

    node.frustumCulled = false;
  });
}

function prepareRestPoseMeshes(root) {
  if (!root) return;

  const skinned = [];

  root.traverse((node) => {
    if (node.isSkinnedMesh) skinned.push(node);
  });

  // Retarget Rest Pose is about the deforming character, not exported
  // controller widgets/custom shapes. CloudRig FBXs can contain large helper
  // meshes far away from the body; showing them is what produced the gigantic
  // black geometry in the viewport.
  root.traverse((node) => {
    if (!node.isMesh) return;

    node.userData.__restPoseRenderable = Boolean(node.isSkinnedMesh);

    if (!node.isSkinnedMesh) {
      node.visible = false;
    }
  });

  // Fallback for unusually simple FBXs with no SkinnedMesh at all.
  if (!skinned.length) {
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.userData.__restPoseRenderable = true;
      node.visible = true;
    });
  }
}

function setMeshVisibility(root, visible) {
  root?.traverse((node) => {
    if (!node.isMesh) return;

    node.visible =
      Boolean(visible) &&
      node.userData.__restPoseRenderable !== false;
  });
}

function safeBoxFromObject(object) {
  if (!object) return null;

  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(
    object,
    true
  );

  if (box.isEmpty()) return null;

  const values = [
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z,
  ];

  if (
    values.some(
      (value) => !Number.isFinite(value)
    )
  ) {
    return null;
  }

  return box;
}

function chooseDisplayBoneSet(bones) {
  const names = [...bones.keys()];
  const body = names.filter((name) => isHumanoidBodyBoneName(name));

  // A humanoid Source/Target should use only the actual body chain for scale,
  // framing and skeleton drawing. This rejects hair, face, IK, pole, stretch,
  // custom-shape and other CloudRig helper bones.
  if (body.length >= 10) {
    return new Set(body);
  }

  const def = names.filter((name) =>
    /^def[-_:]/i.test(name) &&
    !/(hair|face|eye|jaw|tongue|teeth|ear|cloth|skirt|breast|helper|pole|ik|mch|org)/i.test(name)
  );

  if (def.length >= 8) {
    return new Set(def);
  }

  const mixamo = names.filter((name) =>
    /^mixamorig/i.test(name) &&
    !/(end|nub)$/i.test(name)
  );

  if (mixamo.length >= 8) {
    return new Set(mixamo);
  }

  const fk = names.filter((name) =>
    /^fk[-_:]/i.test(name) &&
    !/(hng|hanger|hair|face|eye|jaw|pole|ik)/i.test(name)
  );

  if (fk.length >= 8) {
    return new Set(fk);
  }

  return new Set(
    names.filter((name) =>
      !/(mch|org|ctrl|control|pole|target|line-|dsp-|snap-|scale-|p-str|str-|root-|ik-|hng|hair|face|eye|jaw)/i.test(name)
    )
  );
}

function isHumanoidBodyBoneName(name) {
  const value = normalizeHandleName(name);

  return /(?:hips?|pelvis|root|spine|chest|neck|head|shoulder|clavicle|upperarm|arm|forearm|lowerarm|hand|wrist|upleg|upperleg|thigh|leg|lowerleg|shin|calf|knee|foot|ankle|toe)/.test(value) &&
    !/(hair|face|eye|jaw|tongue|teeth|ear|cloth|skirt|breast|helper|pole|ik|mch|org|ctrl|control|hng|hanger|stretch|twist|tweak|roll)/.test(value);
}

function createFilteredSkeletonView(bones, color) {
  if (!bones?.size) return null;

  const selected = chooseDisplayBoneSet(bones);
  const segments = [];

  for (const [name, bone] of bones) {
    if (!selected.has(name)) continue;

    let parent = bone.parent;

    while (
      parent &&
      parent.isBone &&
      !selected.has(parent.name)
    ) {
      parent = parent.parent;
    }

    if (
      parent?.isBone &&
      selected.has(parent.name)
    ) {
      segments.push([bone, parent]);
    }
  }

  if (!segments.length) return null;

  const positions = new Float32Array(
    segments.length * 2 * 3
  );

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      positions,
      3
    )
  );

  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });

  const line = new THREE.LineSegments(
    geometry,
    material
  );

  line.frustumCulled = false;
  line.renderOrder = 25;

  return {
    line,
    segments,
  };
}

function updateFilteredSkeletonView(view) {
  if (!view?.line || !view.segments?.length) {
    return;
  }

  const attribute =
    view.line.geometry.getAttribute('position');

  const point = new THREE.Vector3();
  let offset = 0;

  for (const [child, parent] of view.segments) {
    child.getWorldPosition(point);
    attribute.array[offset++] = point.x;
    attribute.array[offset++] = point.y;
    attribute.array[offset++] = point.z;

    parent.getWorldPosition(point);
    attribute.array[offset++] = point.x;
    attribute.array[offset++] = point.y;
    attribute.array[offset++] = point.z;
  }

  attribute.needsUpdate = true;
  view.line.geometry.computeBoundingSphere();
}

function normalizeHandleName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/^(def|fk|org|mch|ctrl)[-_:]/, '')
    .replace(/[^a-z0-9]/g, '');
}

function semanticNameForHandle(name) {
  let value = normalizeHandleName(name);

  let side = '';

  if (/^left/.test(value)) {
    side = 'left';
    value = value.replace(/^left/, '');
  } else if (/^right/.test(value)) {
    side = 'right';
    value = value.replace(/^right/, '');
  } else if (/[lr]$/.test(value)) {
    // Three.js sanitizes ".L/.R" to a trailing L/R.
    const stem = value.slice(0, -1);
    if (
      /(?:shoulder|clavicle|upperarm|forearm|lowerarm|hand|wrist|upleg|upperleg|thigh|leg|lowerleg|shin|calf|knee|foot|ankle|toe)$/.test(stem)
    ) {
      side = value.endsWith('l') ? 'left' : 'right';
      value = stem;
    }
  }

  if (/shoulder|clavicle/.test(value)) return side + 'shoulder';
  if (/forearm|lowerarm/.test(value)) return side + 'forearm';
  if (/upperarm/.test(value) || value === 'arm') return side + 'upperarm';
  if (/hand|wrist/.test(value)) return side + 'hand';

  if (/upleg|upperleg|thigh/.test(value)) return side + 'thigh';
  if (/lowerleg|shin|calf|knee/.test(value) || value === 'leg') return side + 'shin';
  if (/foot|ankle/.test(value)) return side + 'foot';

  if (/hips|pelvis/.test(value)) return 'hips';
  if (/chest/.test(value)) return 'chest';
  if (/spine/.test(value)) return 'spine';
  if (/neck/.test(value)) return 'neck';
  if (/head/.test(value)) return 'head';

  return side + value;
}

function choosePoseHandleBones(bones) {
  const wanted = [
    'hips',
    'spine',
    'chest',
    'neck',
    'head',

    'leftshoulder',
    'leftupperarm',
    'leftforearm',
    'lefthand',

    'rightshoulder',
    'rightupperarm',
    'rightforearm',
    'righthand',

    'leftthigh',
    'leftshin',
    'leftfoot',

    'rightthigh',
    'rightshin',
    'rightfoot',
  ];

  const best = new Map();

  const scoreBone = (name) => {
    const n = String(name || '').toLowerCase();
    let score = 0;

    if (/^mixamorig/.test(n)) score += 100;
    if (/^def[-_:]/.test(n)) score += 90;
    if (/^fk[-_:]/.test(n)) score += 80;

    if (/(mch|org|ctrl|control|pole|target|line-|dsp-|snap-|scale-|ik-|hng|p-str|str-|twist|tweak|roll)/i.test(n)) {
      score -= 100;
    }

    return score;
  };

  for (const [name, bone] of bones) {
    const semantic = semanticNameForHandle(name);
    if (!wanted.includes(semantic)) continue;

    const current = best.get(semantic);
    if (
      !current ||
      scoreBone(name) > scoreBone(current.name)
    ) {
      best.set(semantic, bone);
    }
  }

  return wanted
    .map((semantic) => best.get(semantic))
    .filter(Boolean);
}

function getPoseHandleWorldPosition(handle, target = new THREE.Vector3()) {
  const bone = handle?.userData?.bone;
  if (!bone) return target.set(0, 0, 0);

  bone.getWorldPosition(target);

  const semantic = handle.userData.semantic || '';

  // Put limb controls in the middle of their segment, like Blender custom
  // shapes, instead of stacking all controls on shoulder/elbow/knee joints.
  if (
    /shoulder|upperarm|forearm|thigh|shin/.test(semantic)
  ) {
    const child =
      bone.children.find((item) => item.isBone) ||
      null;

    if (child) {
      const childWorld = new THREE.Vector3();
      child.getWorldPosition(childWorld);
      target.lerp(childWorld, 0.5);
    }
  }

  return target;
}

function findOppositeBoneName(name, names) {
  const list = names || [];
  const candidates = [];

  const push = (value) => {
    if (
      value &&
      value !== name &&
      !candidates.includes(value)
    ) {
      candidates.push(value);
    }
  };

  push(name.replace(/Left/g, 'Right'));
  push(name.replace(/left/g, 'right'));
  push(name.replace(/Right/g, 'Left'));
  push(name.replace(/right/g, 'left'));

  push(name.replace(/\.L$/i, '.R'));
  push(name.replace(/\.R$/i, '.L'));
  push(name.replace(/_L$/i, '_R'));
  push(name.replace(/_R$/i, '_L'));
  push(name.replace(/-L$/i, '-R'));
  push(name.replace(/-R$/i, '-L'));

  // Three.js may sanitize ".L/.R" into a trailing L/R.
  if (/L$/.test(name)) {
    push(name.slice(0, -1) + 'R');
  }
  if (/R$/.test(name)) {
    push(name.slice(0, -1) + 'L');
  }

  const lowerMap = new Map(
    list.map((item) => [
      String(item).toLowerCase(),
      item,
    ])
  );

  for (const candidate of candidates) {
    const found = lowerMap.get(
      candidate.toLowerCase()
    );

    if (found) return found;
  }

  return '';
}

function axisViewDefinition(axisView) {
  const definitions = {
    '+x': {
      direction: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
    },
    '-x': {
      direction: new THREE.Vector3(-1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
    },
    '+y': {
      direction: new THREE.Vector3(0, 1, 0),
      up: new THREE.Vector3(0, 0, -1),
    },
    '-y': {
      direction: new THREE.Vector3(0, -1, 0),
      up: new THREE.Vector3(0, 0, 1),
    },
    '+z': {
      direction: new THREE.Vector3(0, 0, 1),
      up: new THREE.Vector3(0, 1, 0),
    },
    '-z': {
      direction: new THREE.Vector3(0, 0, -1),
      up: new THREE.Vector3(0, 1, 0),
    },
  };

  return (
    definitions[axisView] ||
    definitions['+z']
  );
}

function nearestAxisViewFromDirection(direction) {
  const dir = direction.clone().normalize();

  const candidates = [
    ['+x', new THREE.Vector3(1, 0, 0)],
    ['-x', new THREE.Vector3(-1, 0, 0)],
    ['+y', new THREE.Vector3(0, 1, 0)],
    ['-y', new THREE.Vector3(0, -1, 0)],
    ['+z', new THREE.Vector3(0, 0, 1)],
    ['-z', new THREE.Vector3(0, 0, -1)],
  ];

  let best = '+z';
  let bestDot = -Infinity;

  for (const [key, axis] of candidates) {
    const dot = dir.dot(axis);

    if (dot > bestDot) {
      bestDot = dot;
      best = key;
    }
  }

  return best;
}

function virtualOrbitDirectionFromDrag(
  drag,
  dx,
  dy
) {
  const yaw = -dx * 0.0075;
  const pitch = -dy * 0.0075;

  const worldUp = new THREE.Vector3(0, 1, 0);
  const qYaw = new THREE.Quaternion()
    .setFromAxisAngle(worldUp, yaw);

  const direction = drag.startDirection
    .clone()
    .applyQuaternion(qYaw)
    .normalize();

  const right = drag.startRight
    .clone()
    .applyQuaternion(qYaw)
    .normalize();

  const qPitch = new THREE.Quaternion()
    .setFromAxisAngle(right, pitch);

  direction
    .applyQuaternion(qPitch)
    .normalize();

  return direction;
}

function safePerspectiveDirection(direction) {
  const dir = direction.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);

  if (
    Math.abs(dir.dot(worldUp)) > 0.9995
  ) {
    dir.z += dir.y >= 0
      ? 0.001
      : -0.001;

    dir.normalize();
  }

  return dir;
}

function disposePreviewClone(root) {
  root?.traverse((node) => {
    if (!node.isMesh) return;

    const materials =
      Array.isArray(node.material)
        ? node.material
        : [node.material];

    materials.forEach(
      (material) => material?.dispose?.()
    );
  });
}
