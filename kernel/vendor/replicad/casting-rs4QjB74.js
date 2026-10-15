//#region src/oclib.ts
var OC = { library: null };
var setOC = (oc) => {
	OC.library = oc;
};
var getOC = () => {
	if (!OC.library) throw new Error("oppencascade has not been loaded");
	return OC.library;
};
//#endregion
//#region src/register.ts
if (!globalThis.FinalizationRegistry) {
	console.log("Garbage collection will not work");
	globalThis.FinalizationRegistry = (() => ({
		register: () => null,
		unregister: () => null
	}));
}
var deletetableRegistry = new globalThis.FinalizationRegistry((heldValue) => {
	if (!heldValue) return;
	try {
		heldValue.delete();
	} catch (e) {
		console.error(e);
	}
});
var WrappingObj = class {
	constructor(wrapped) {
		this.oc = getOC();
		if (wrapped) deletetableRegistry.register(this, wrapped, wrapped);
		this._wrapped = wrapped;
	}
	get wrapped() {
		if (this._wrapped === null) throw new Error("This object has been deleted");
		return this._wrapped;
	}
	set wrapped(newWrapped) {
		if (this._wrapped) {
			deletetableRegistry.unregister(this._wrapped);
			this._wrapped.delete();
		}
		if (newWrapped) deletetableRegistry.register(this, newWrapped, newWrapped);
		this._wrapped = newWrapped;
	}
	delete() {
		const wrapped = this._wrapped;
		if (wrapped === null) return;
		this._wrapped = null;
		deletetableRegistry.unregister(wrapped);
		wrapped.delete();
	}
};
if (typeof Symbol.dispose === "symbol") Object.defineProperty(WrappingObj.prototype, Symbol.dispose, {
	configurable: true,
	writable: true,
	value() {
		this.delete();
	}
});
var GCWithScope = () => {
	function gcWithScope(value) {
		if (value) deletetableRegistry.register(gcWithScope, value);
		return value;
	}
	return gcWithScope;
};
var GCWithObject = (obj) => {
	function registerForGC(value) {
		if (value) deletetableRegistry.register(obj, value);
		return value;
	}
	return registerForGC;
};
var localGC = (debug) => {
	const cleaner = /* @__PURE__ */ new Set();
	return [
		(v) => {
			cleaner.add(v);
			return v;
		},
		() => {
			[...cleaner.values()].forEach((d) => d.delete());
			cleaner.clear();
		},
		debug ? cleaner : void 0
	];
};
//#endregion
//#region src/constants.ts
var HASH_CODE_MAX = 2147483647;
var DEG2RAD = Math.PI / 180;
var RAD2DEG = 180 / Math.PI;
//#endregion
//#region src/geom.ts
var round3 = (v) => Math.round(v * 1e3) / 1e3;
function isPoint(p) {
	if (Array.isArray(p)) return p.length === 3 || p.length === 2;
	else if (p instanceof Vector) return true;
	else if (p && typeof p?.XYZ === "function") return true;
	return false;
}
var makeAx3 = (center, dir, xDir) => {
	const oc = getOC();
	const origin = asPnt(center);
	const direction = asDir(dir);
	let axis;
	if (xDir) {
		const xDirection = asDir(xDir);
		axis = new oc.gp_Ax3(origin, direction, xDirection);
		xDirection.delete();
	} else axis = new oc.gp_Ax3(origin, direction);
	origin.delete();
	direction.delete();
	return axis;
};
function makePln(origin, dir) {
	const orig = asPnt(origin);
	const direction = asDir(dir);
	const pln = new (getOC()).gp_Pln(orig, direction);
	orig.delete();
	direction.delete();
	return pln;
}
var makeAx2 = (center, dir, xDir) => {
	const oc = getOC();
	const origin = asPnt(center);
	const direction = asDir(dir);
	let axis;
	if (xDir) {
		const xDirection = asDir(xDir);
		axis = new oc.gp_Ax2(origin, direction, xDirection);
		xDirection.delete();
	} else axis = new oc.gp_Ax2(origin, direction);
	origin.delete();
	direction.delete();
	return axis;
};
var makeAx1 = (center, dir) => {
	const oc = getOC();
	const origin = asPnt(center);
	const direction = asDir(dir);
	const axis = new oc.gp_Ax1(origin, direction);
	origin.delete();
	direction.delete();
	return axis;
};
var makeVec = (vector = [
	0,
	0,
	0
]) => {
	const oc = getOC();
	if (Array.isArray(vector)) {
		if (vector.length === 3) return new oc.gp_Vec(...vector);
		else if (vector.length === 2) return new oc.gp_Vec(...vector, 0);
	} else if (vector instanceof Vector) return new oc.gp_Vec(vector.wrapped.XYZ());
	else if (vector.XYZ) return new oc.gp_Vec(vector.XYZ());
	return new oc.gp_Vec(0, 0, 0);
};
var Vector = class Vector extends WrappingObj {
	constructor(vector = [
		0,
		0,
		0
	]) {
		super(makeVec(vector));
	}
	get repr() {
		return `x: ${round3(this.x)}, y: ${round3(this.y)}, z: ${round3(this.z)}`;
	}
	get x() {
		return this.wrapped.X();
	}
	get y() {
		return this.wrapped.Y();
	}
	get z() {
		return this.wrapped.Z();
	}
	get Length() {
		return this.wrapped.Magnitude();
	}
	toTuple() {
		return [
			this.x,
			this.y,
			this.z
		];
	}
	cross(v) {
		return new Vector(this.wrapped.Crossed(v.wrapped));
	}
	dot(v) {
		return this.wrapped.Dot(v.wrapped);
	}
	sub(v) {
		return new Vector(this.wrapped.Subtracted(v.wrapped));
	}
	add(v) {
		return new Vector(this.wrapped.Added(v.wrapped));
	}
	multiply(scale) {
		return new Vector(this.wrapped.Multiplied(scale));
	}
	normalized() {
		return new Vector(this.wrapped.Normalized());
	}
	normalize() {
		this.wrapped.Normalize();
		return this;
	}
	getCenter() {
		return this;
	}
	getAngle(v) {
		return this.wrapped.Angle(v.wrapped) * RAD2DEG;
	}
	projectToPlane(plane) {
		const base = plane.origin;
		const normal = plane.zDir;
		const v1 = this.sub(base);
		const v2 = normal.multiply(v1.dot(normal) / normal.Length ** 2);
		const projection = this.sub(v2);
		v1.delete();
		v2.delete();
		return projection;
	}
	equals(other) {
		return this.wrapped.IsEqual(other.wrapped, 1e-5, 1e-5);
	}
	toPnt() {
		return new this.oc.gp_Pnt(this.wrapped.XYZ());
	}
	toDir() {
		return new this.oc.gp_Dir(this.wrapped.XYZ());
	}
	rotate(angle, center = [
		0,
		0,
		0
	], direction = [
		0,
		0,
		1
	]) {
		const ax = makeAx1(center, direction);
		this.wrapped.Rotate(ax, angle * DEG2RAD);
		ax.delete();
		return this;
	}
};
var AXIS_NAMES = [
	"X",
	"Y",
	"Z",
	"-X",
	"-Y",
	"-Z"
];
var DIRECTIONS = {
	X: [
		1,
		0,
		0
	],
	Y: [
		0,
		1,
		0
	],
	Z: [
		0,
		0,
		1
	],
	"-X": [
		-1,
		0,
		0
	],
	"-Y": [
		0,
		-1,
		0
	],
	"-Z": [
		0,
		0,
		-1
	]
};
function resolveDirection(direction) {
	if (typeof direction !== "string") return direction;
	const resolved = DIRECTIONS[direction];
	if (!resolved) throw new Error(`Invalid direction "${direction}". Expected one of: ${AXIS_NAMES.join(", ")}.`);
	return resolved;
}
var makeDirection = resolveDirection;
function makeDirVector(direction) {
	return new Vector(resolveDirection(direction));
}
function asPnt(coords) {
	const v = new Vector(coords);
	const pnt = v.toPnt();
	v.delete();
	return pnt;
}
function asDir(direction) {
	const v = makeDirVector(direction);
	const dir = v.toDir();
	v.delete();
	return dir;
}
var Transformation = class Transformation extends WrappingObj {
	constructor(transform) {
		const oc = getOC();
		super(transform || new oc.gp_Trsf());
	}
	clone() {
		const clone = this.wrapped.Inverted();
		clone.Invert();
		return new Transformation(clone);
	}
	translate(xDistOrVector, yDist = 0, zDist = 0) {
		const translation = new Vector(typeof xDistOrVector === "number" ? [
			xDistOrVector,
			yDist,
			zDist
		] : xDistOrVector);
		this.wrapped.SetTranslation(translation.wrapped);
		return this;
	}
	rotate(angle, position = [
		0,
		0,
		0
	], direction = [
		0,
		0,
		1
	]) {
		const dir = asDir(direction);
		const origin = asPnt(position);
		const axis = new this.oc.gp_Ax1(origin, dir);
		this.wrapped.SetRotation(axis, angle * DEG2RAD);
		axis.delete();
		dir.delete();
		origin.delete();
		return this;
	}
	mirror(inputPlane = "YZ", inputOrigin) {
		const r = GCWithScope();
		let origin;
		let direction;
		if (typeof inputPlane === "string") {
			const plane = r(createNamedPlane(inputPlane, inputOrigin));
			origin = plane.origin;
			direction = plane.zDir;
		} else if (inputPlane instanceof Plane) {
			origin = inputOrigin || inputPlane.origin;
			direction = inputPlane.zDir;
		} else {
			origin = inputOrigin || [
				0,
				0,
				0
			];
			direction = inputPlane;
		}
		const mirrorAxis = r(makeAx2(origin, direction));
		this.wrapped.SetMirror(mirrorAxis);
		return this;
	}
	scale(center, scale) {
		const pnt = asPnt(center);
		this.wrapped.SetScale(pnt, scale);
		pnt.delete();
		return this;
	}
	inverse() {
		this.wrapped.Invert();
		return this;
	}
	inverted() {
		return new Transformation(this.wrapped.Inverted());
	}
	coordSystemChange(fromSystem, toSystem) {
		const r = GCWithScope();
		const fromAx = r(fromSystem === "reference" ? new this.oc.gp_Ax3() : makeAx3(fromSystem.origin, fromSystem.zDir, fromSystem.xDir));
		const toAx = r(toSystem === "reference" ? new this.oc.gp_Ax3() : makeAx3(toSystem.origin, toSystem.zDir, toSystem.xDir));
		this.wrapped.SetTransformation(fromAx, toAx);
		return this;
	}
	transformPoint(point) {
		const pnt = asPnt(point);
		const newPoint = pnt.Transformed(this.wrapped);
		pnt.delete();
		return newPoint;
	}
	transform(shape) {
		return new this.oc.BRepBuilderAPI_Transform(shape, this.wrapped, true, false).ModifiedShape(shape);
	}
};
var Plane = class Plane {
	constructor(origin, xDirection = null, normal = [
		0,
		0,
		1
	]) {
		this.oc = getOC();
		const zDir = makeDirVector(normal);
		if (zDir.Length === 0) throw new Error("normal should be non null");
		this.zDir = zDir.normalize();
		let xDir;
		if (!xDirection) {
			const ax3 = makeAx3(origin, this.zDir);
			const defaultXDirection = ax3.XDirection();
			xDir = makeDirVector(defaultXDirection);
			defaultXDirection.delete();
			ax3.delete();
		} else xDir = makeDirVector(xDirection);
		if (xDir.Length === 0) throw new Error("xDir should be non null");
		this.xDir = xDir.normalize();
		this.yDir = this.zDir.cross(this.xDir).normalize();
		this.origin = new Vector(origin);
	}
	delete() {
		this.localToGlobal.delete();
		this.xDir.delete();
		this.yDir.delete();
		this.zDir.delete();
		this._origin.delete();
	}
	clone() {
		return new Plane(this.origin, this.xDir, this.zDir);
	}
	get origin() {
		return this._origin;
	}
	set origin(newOrigin) {
		this._origin = newOrigin;
		this._calcTransforms();
	}
	translateTo(point) {
		const newPlane = this.clone();
		newPlane.origin = new Vector(point);
		return newPlane;
	}
	translate(xDistOrVector, yDist = 0, zDist = 0) {
		const translation = new Vector(typeof xDistOrVector === "number" ? [
			xDistOrVector,
			yDist,
			zDist
		] : xDistOrVector);
		return this.translateTo(this.origin.add(translation));
	}
	translateX(xDist) {
		return this.translate(xDist, 0, 0);
	}
	translateY(yDist) {
		return this.translate(0, yDist, 0);
	}
	translateZ(zDist) {
		return this.translate(0, 0, zDist);
	}
	pivot(angle, direction = [
		1,
		0,
		0
	]) {
		const zDir = new Vector(this.zDir).rotate(angle, [
			0,
			0,
			0
		], direction);
		const xDir = new Vector(this.xDir).rotate(angle, [
			0,
			0,
			0
		], direction);
		return new Plane(this.origin, xDir, zDir);
	}
	rotate2DAxes(angle) {
		const xDir = new Vector(this.xDir).rotate(angle, [
			0,
			0,
			0
		], this.zDir);
		return new Plane(this.origin, xDir, this.zDir);
	}
	_calcTransforms() {
		const globalCoordSystem = new this.oc.gp_Ax3();
		const localCoordSystem = makeAx3(this.origin, this.zDir, this.xDir);
		new this.oc.gp_Trsf().SetTransformation(globalCoordSystem, localCoordSystem);
		this.globalToLocal = new Transformation();
		this.globalToLocal.coordSystemChange("reference", {
			origin: this.origin,
			zDir: this.zDir,
			xDir: this.xDir
		});
		this.localToGlobal = new Transformation();
		this.localToGlobal.coordSystemChange({
			origin: this.origin,
			zDir: this.zDir,
			xDir: this.xDir
		}, "reference");
	}
	setOrigin2d(x, y) {
		this.origin = this.toWorldCoords([x, y]);
	}
	toLocalCoords(vec) {
		const pnt = this.globalToLocal.transformPoint(vec);
		const newVec = new Vector(pnt);
		pnt.delete();
		return newVec;
	}
	toWorldCoords(v) {
		const pnt = this.localToGlobal.transformPoint(v);
		const newVec = new Vector(pnt);
		pnt.delete();
		return newVec;
	}
};
var PLANES_CONFIG = {
	XY: {
		xDir: [
			1,
			0,
			0
		],
		normal: [
			0,
			0,
			1
		]
	},
	YZ: {
		xDir: [
			0,
			1,
			0
		],
		normal: [
			1,
			0,
			0
		]
	},
	ZX: {
		xDir: [
			0,
			0,
			1
		],
		normal: [
			0,
			1,
			0
		]
	},
	XZ: {
		xDir: [
			1,
			0,
			0
		],
		normal: [
			0,
			-1,
			0
		]
	},
	YX: {
		xDir: [
			0,
			1,
			0
		],
		normal: [
			0,
			0,
			-1
		]
	},
	ZY: {
		xDir: [
			0,
			0,
			1
		],
		normal: [
			-1,
			0,
			0
		]
	},
	front: {
		xDir: [
			1,
			0,
			0
		],
		normal: [
			0,
			0,
			1
		]
	},
	back: {
		xDir: [
			-1,
			0,
			0
		],
		normal: [
			0,
			0,
			-1
		]
	},
	left: {
		xDir: [
			0,
			0,
			1
		],
		normal: [
			-1,
			0,
			0
		]
	},
	right: {
		xDir: [
			0,
			0,
			-1
		],
		normal: [
			1,
			0,
			0
		]
	},
	top: {
		xDir: [
			1,
			0,
			0
		],
		normal: [
			0,
			1,
			0
		]
	},
	bottom: {
		xDir: [
			1,
			0,
			0
		],
		normal: [
			0,
			-1,
			0
		]
	}
};
var createNamedPlane = (plane, sourceOrigin = [
	0,
	0,
	0
]) => {
	const config = PLANES_CONFIG[plane];
	if (!config) throw new Error(`Could not find plane ${plane}`);
	let origin;
	if (typeof sourceOrigin === "number") origin = config.normal.map((v) => v * sourceOrigin);
	else origin = sourceOrigin;
	return new Plane(origin, config.xDir, config.normal);
};
var BoundingBox = class BoundingBox extends WrappingObj {
	constructor(wrapped) {
		const oc = getOC();
		let boundBox = wrapped;
		if (!boundBox) boundBox = new oc.Bnd_Box();
		super(boundBox);
	}
	static fromBounds(min, max) {
		const box = new BoundingBox();
		box.wrapped.Update(min[0], min[1], min[2], max[0], max[1], max[2]);
		return box;
	}
	get repr() {
		const [min, max] = this.bounds;
		return `${new Vector(min).repr} - ${new Vector(max).repr}`;
	}
	get bounds() {
		const cornerMin = this.wrapped.CornerMin();
		const cornerMax = this.wrapped.CornerMax();
		const result = [[
			cornerMin.X(),
			cornerMin.Y(),
			cornerMin.Z()
		], [
			cornerMax.X(),
			cornerMax.Y(),
			cornerMax.Z()
		]];
		cornerMin.delete();
		cornerMax.delete();
		return result;
	}
	get center() {
		const [[xmin, ymin, zmin], [xmax, ymax, zmax]] = this.bounds;
		return [
			xmin + (xmax - xmin) / 2,
			ymin + (ymax - ymin) / 2,
			zmin + (zmax - zmin) / 2
		];
	}
	get width() {
		const [[xmin], [xmax]] = this.bounds;
		return Math.abs(xmax - xmin);
	}
	get height() {
		const [[, ymin], [, ymax]] = this.bounds;
		return Math.abs(ymax - ymin);
	}
	get depth() {
		const [[, , zmin], [, , zmax]] = this.bounds;
		return Math.abs(zmax - zmin);
	}
	add(other) {
		this.wrapped.Add(other.wrapped);
	}
	isOut(other) {
		return this.wrapped.IsOut(other.wrapped);
	}
};
//#endregion
//#region src/geomHelpers.ts
var makePlaneFromFace = (face, originOnSurface = [0, 0]) => {
	const originPoint = face.pointOnSurface(...originOnSurface);
	const normal = face.normalAt(originPoint);
	const v = new Vector([
		0,
		0,
		1
	]);
	let xd = v.cross(normal);
	if (xd.Length < 1e-8) {
		xd.delete();
		xd = new Vector([
			1,
			0,
			0
		]);
	}
	v.delete();
	return new Plane(originPoint, xd, normal);
};
function makePlane(plane = "XY", origin = [
	0,
	0,
	0
]) {
	if (plane instanceof Plane) return plane.clone();
	else return createNamedPlane(plane, origin);
}
function rotate(shape, angle, position = [
	0,
	0,
	0
], direction = [
	0,
	0,
	1
]) {
	const transformation = new Transformation();
	transformation.rotate(angle, position, direction);
	const newShape = transformation.transform(shape);
	transformation.delete();
	return newShape;
}
function translate(shape, vector) {
	const transformation = new Transformation();
	transformation.translate(vector);
	const newShape = transformation.transform(shape);
	transformation.delete();
	return newShape;
}
function mirror(shape, inputPlane, origin) {
	const transformation = new Transformation();
	transformation.mirror(inputPlane, origin);
	const newShape = transformation.transform(shape);
	transformation.delete();
	return newShape;
}
function scale(shape, center, scale) {
	const transformation = new Transformation();
	transformation.scale(center, scale);
	const newShape = transformation.transform(shape);
	transformation.delete();
	return newShape;
}
//#endregion
//#region src/definitionMaps.ts
var CURVE_TYPES_MAP = null;
var getCurveTypesMap = (refresh) => {
	if (CURVE_TYPES_MAP && !refresh) return CURVE_TYPES_MAP;
	const ga = getOC().GeomAbs_CurveType;
	CURVE_TYPES_MAP = /* @__PURE__ */ new Map([
		[ga.GeomAbs_Line, "LINE"],
		[ga.GeomAbs_Circle, "CIRCLE"],
		[ga.GeomAbs_Ellipse, "ELLIPSE"],
		[ga.GeomAbs_Hyperbola, "HYPERBOLA"],
		[ga.GeomAbs_Parabola, "PARABOLA"],
		[ga.GeomAbs_BezierCurve, "BEZIER_CURVE"],
		[ga.GeomAbs_BSplineCurve, "BSPLINE_CURVE"],
		[ga.GeomAbs_OffsetCurve, "OFFSET_CURVE"],
		[ga.GeomAbs_OtherCurve, "OTHER_CURVE"]
	]);
	return CURVE_TYPES_MAP;
};
var findCurveType = (type) => {
	let shapeType = getCurveTypesMap().get(type);
	if (!shapeType) shapeType = getCurveTypesMap(true).get(type);
	if (!shapeType) throw new Error("unknown type");
	return shapeType;
};
//#endregion
//#region src/shapeFunctions/shapeInput.ts
var unwrapShape = (shape) => {
	return "wrapped" in shape ? shape.wrapped : shape;
};
//#endregion
//#region src/shapeFunctions/mesh.ts
var extractFromPointer = (heap, pointer, size) => {
	const start = (pointer >>> 0) / heap.BYTES_PER_ELEMENT;
	return Array.from(heap.subarray(start, start + size));
};
function prepareShapeForMesh(shapeInput, { tolerance = .001, angularTolerance = .1 } = {}) {
	const oc = getOC();
	const shape = unwrapShape(shapeInput);
	oc.ReplicadMeshExtractor.mesh(shape, tolerance, angularTolerance);
}
/**
* Exports a shape as triangles suitable for use by rendering libraries.
*
* @category Shape Export
*/
function mesh(shapeInput, { tolerance = .001, angularTolerance = .1 } = {}) {
	const oc = getOC();
	const shape = unwrapShape(shapeInput);
	const raw = oc.ReplicadMeshExtractor.extract(shape, tolerance, angularTolerance, false);
	const buffer = oc.wasmMemory.buffer;
	const heapF32 = new Float32Array(buffer);
	const heapU32 = new Uint32Array(buffer);
	const heapI32 = new Int32Array(buffer);
	const vertices = extractFromPointer(heapF32, raw.getVerticesPtr(), raw.getVerticesSize());
	const normals = extractFromPointer(heapF32, raw.getNormalsPtr(), raw.getNormalsSize());
	const triangles = extractFromPointer(heapU32, raw.getTrianglesPtr(), raw.getTrianglesSize());
	const groupsRaw = extractFromPointer(heapI32, raw.getFaceGroupsPtr(), raw.getFaceGroupsSize());
	const faceGroups = [];
	for (let i = 0; i < groupsRaw.length; i += 3) faceGroups.push({
		start: groupsRaw[i],
		count: groupsRaw[i + 1],
		faceId: groupsRaw[i + 2]
	});
	raw.delete();
	return {
		triangles,
		vertices,
		normals,
		faceGroups
	};
}
/**
* Exports a shape's edges as lines suitable for use by rendering libraries.
*
* @category Shape Export
*/
function meshEdges(shapeInput, { tolerance = .001, angularTolerance = .1 } = {}) {
	const oc = getOC();
	const shape = unwrapShape(shapeInput);
	const raw = oc.ReplicadEdgeMeshExtractor.extract(shape, tolerance, angularTolerance);
	const buffer = oc.wasmMemory.buffer;
	const heapF32 = new Float32Array(buffer);
	const heapI32 = new Int32Array(buffer);
	const lines = extractFromPointer(heapF32, raw.getLinesPtr(), raw.getLinesSize());
	const groupsRaw = extractFromPointer(heapI32, raw.getEdgeGroupsPtr(), raw.getEdgeGroupsSize());
	const edgeGroups = [];
	for (let i = 0; i < groupsRaw.length; i += 3) edgeGroups.push({
		start: groupsRaw[i],
		count: groupsRaw[i + 1],
		edgeId: groupsRaw[i + 2]
	});
	raw.delete();
	return {
		lines,
		edgeGroups
	};
}
/**
* Returns the cached triangulation of a face, if one is available.
*
* @category Shape Export
*/
function triangulateFace(faceInput, index0 = 0) {
	const oc = getOC();
	const face = unwrapShape(faceInput);
	const r = GCWithScope();
	const location = r(new oc.TopLoc_Location());
	const triangulation = r(oc.BRep_Tool.Triangulation(face, location, 0));
	if (!triangulation || triangulation.isNull()) return null;
	const transformation = r(location.Transformation());
	const result = {
		vertices: [],
		trianglesIndexes: [],
		verticesNormals: []
	};
	const nbNodes = triangulation.NbNodes();
	result.vertices = new Array(nbNodes * 3);
	for (let i = 1; i <= nbNodes; i++) {
		const point = r(r(triangulation.Node(i)).Transformed(transformation));
		result.vertices[(i - 1) * 3] = point.X();
		result.vertices[(i - 1) * 3 + 1] = point.Y();
		result.vertices[(i - 1) * 3 + 2] = point.Z();
	}
	const isForward = face.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD;
	const normalSign = isForward ? 1 : -1;
	if (!triangulation.HasNormals()) triangulation.ComputeNormals();
	result.verticesNormals = new Array(nbNodes * 3);
	for (let i = 1; i <= nbNodes; i++) {
		const normal = r(r(triangulation.Normal(i)).Transformed(transformation));
		result.verticesNormals[(i - 1) * 3] = normal.X() * normalSign;
		result.verticesNormals[(i - 1) * 3 + 1] = normal.Y() * normalSign;
		result.verticesNormals[(i - 1) * 3 + 2] = normal.Z() * normalSign;
	}
	const nbTriangles = triangulation.NbTriangles();
	result.trianglesIndexes = new Array(nbTriangles * 3);
	for (let nt = 1; nt <= nbTriangles; nt++) {
		const triangle = r(triangulation.Triangle(nt));
		let n1 = triangle.Value(1);
		let n2 = triangle.Value(2);
		const n3 = triangle.Value(3);
		if (!isForward) [n1, n2] = [n2, n1];
		result.trianglesIndexes[(nt - 1) * 3] = n1 - 1 + index0;
		result.trianglesIndexes[(nt - 1) * 3 + 1] = n2 - 1 + index0;
		result.trianglesIndexes[(nt - 1) * 3 + 2] = n3 - 1 + index0;
	}
	return result;
}
//#endregion
//#region src/shapeFunctions/export.ts
/**
* Serializes a shape to OpenCascade's BRep text representation.
*
* @category Shape Export
*/
function serializeShape(shapeInput) {
	return getOC().BRepToolsWrapper.Write(unwrapShape(shapeInput));
}
function deserializeTopoShape(data) {
	return getOC().BRepToolsWrapper.Read(data);
}
/**
* Exports a single shape as a STEP file.
*
* For named or colored assemblies, use `exportSTEP` instead.
*
* @category Shape Export
*/
function exportShapeSTEP(shapeInput) {
	const oc = getOC();
	const shape = unwrapShape(shapeInput);
	const filename = "blob.step";
	const writer = new oc.STEPControl_Writer();
	oc.Interface_Static.SetIVal("write.step.schema", 5);
	const progress = new oc.Message_ProgressRange();
	writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
	const done = writer.Write(filename);
	writer.delete();
	progress.delete();
	if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
		const file = oc.FS.readFile("/blob.step");
		oc.FS.unlink("/blob.step");
		return new Blob([file], { type: "application/STEP" });
	}
	throw new Error("WRITE STEP FILE FAILED.");
}
/**
* Exports a shape as an STL file.
*
* @category Shape Export
*/
function exportShapeSTL(shapeInput, { tolerance = .001, angularTolerance = .1, binary = false } = {}) {
	const oc = getOC();
	const shape = unwrapShape(shapeInput);
	prepareShapeForMesh(shape, {
		tolerance,
		angularTolerance
	});
	if (oc.StlAPI.Write(shape, "blob.stl", !binary)) {
		const file = oc.FS.readFile("/blob.stl");
		oc.FS.unlink("/blob.stl");
		return new Blob([file], { type: "application/sla" });
	}
	throw new Error("WRITE STL FILE FAILED.");
}
//#endregion
//#region src/shapeFunctions/geometry.ts
var unwrapCurve = (curve) => "wrapped" in curve ? curve.wrapped : curve;
var mapCurveParameter = (curve, position) => {
	const firstParam = curve.FirstParameter();
	return firstParam + (curve.LastParameter() - firstParam) * position;
};
function curveType(curveInput) {
	const curve = unwrapCurve(curveInput);
	return findCurveType(curve.GetType && curve.GetType());
}
function curvePointAt(curveInput, position = .5) {
	const curve = unwrapCurve(curveInput);
	return new Vector(curve.Value(mapCurveParameter(curve, position)));
}
function curveTangentAt(curveInput, position = .5) {
	const oc = getOC();
	const curve = unwrapCurve(curveInput);
	const parameter = mapCurveParameter(curve, position);
	const point = new oc.gp_Pnt();
	const derivative = new oc.gp_Vec();
	curve.D1(parameter, point, derivative);
	const tangent = new Vector(derivative);
	point.delete();
	derivative.delete();
	return tangent;
}
var Curve = class extends WrappingObj {
	get repr() {
		const { startPoint, endPoint } = this;
		const retVal = `start: (${this.startPoint.repr}) end:(${this.endPoint.repr}}`;
		startPoint.delete();
		endPoint.delete();
		return retVal;
	}
	get curveType() {
		return curveType(this);
	}
	get startPoint() {
		return new Vector(this.wrapped.Value(this.wrapped.FirstParameter()));
	}
	get endPoint() {
		return new Vector(this.wrapped.Value(this.wrapped.LastParameter()));
	}
	pointAt(position = .5) {
		return curvePointAt(this, position);
	}
	tangentAt(position = .5) {
		return curveTangentAt(this, position);
	}
	get isClosed() {
		return this.wrapped.IsClosed();
	}
	get isPeriodic() {
		return this.wrapped.IsPeriodic();
	}
	get period() {
		return this.wrapped.Period();
	}
};
var unwrapSurface = (surface) => "wrapped" in surface ? surface.wrapped : surface;
function surfaceType(surfaceInput) {
	const ga = getOC().GeomAbs_SurfaceType;
	const type = (/* @__PURE__ */ new Map([
		[ga.GeomAbs_Plane, "PLANE"],
		[ga.GeomAbs_Cylinder, "CYLINDRE"],
		[ga.GeomAbs_Cone, "CONE"],
		[ga.GeomAbs_Sphere, "SPHERE"],
		[ga.GeomAbs_Torus, "TORUS"],
		[ga.GeomAbs_BezierSurface, "BEZIER_SURFACE"],
		[ga.GeomAbs_BSplineSurface, "BSPLINE_SURFACE"],
		[ga.GeomAbs_SurfaceOfRevolution, "REVOLUTION_SURFACE"],
		[ga.GeomAbs_SurfaceOfExtrusion, "EXTRUSION_SURFACE"],
		[ga.GeomAbs_OffsetSurface, "OFFSET_SURFACE"],
		[ga.GeomAbs_OtherSurface, "OTHER_SURFACE"]
	])).get(unwrapSurface(surfaceInput).GetType());
	if (!type) throw new Error("surface type not found");
	return type;
}
var Surface = class extends WrappingObj {
	get surfaceType() {
		return surfaceType(this);
	}
};
//#endregion
//#region src/shapeFunctions/faceGeometry.ts
function faceUVBounds(faceInput) {
	const result = getOC().BRepTools.UVBounds(unwrapShape(faceInput), 0, 0, 0, 0);
	return {
		uMin: result.UMin,
		uMax: result.UMax,
		vMin: result.VMin,
		vMax: result.VMax
	};
}
function pointOnFace(faceInput, u, v) {
	const oc = getOC();
	const face = unwrapShape(faceInput);
	const { uMin, uMax, vMin, vMax } = faceUVBounds(face);
	const surface = new oc.BRepAdaptor_Surface(face, false);
	const point = new oc.gp_Pnt();
	const absoluteU = u * (uMax - uMin) + uMin;
	const absoluteV = v * (vMax - vMin) + vMin;
	surface.D0(absoluteU, absoluteV, point);
	const result = new Vector(point);
	surface.delete();
	point.delete();
	return result;
}
function faceUVCoordinates(faceInput, point) {
	const oc = getOC();
	const face = unwrapShape(faceInput);
	const r = GCWithScope();
	const surface = r(oc.BRep_Tool.Surface(face));
	const { U, V } = r(new oc.GeomAPI_ProjectPointOnSurf(r(asPnt(point)), surface, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad)).LowerDistanceParameters(0, 0);
	return [U, V];
}
function faceNormalAt(faceInput, location) {
	const oc = getOC();
	const face = unwrapShape(faceInput);
	let u;
	let v;
	if (location) [u, v] = faceUVCoordinates(face, location);
	else {
		const { uMin, uMax, vMin, vMax } = faceUVBounds(face);
		u = .5 * (uMin + uMax);
		v = .5 * (vMin + vMax);
	}
	const r = GCWithScope();
	const point = r(new oc.gp_Pnt());
	const normal = r(new oc.gp_Vec());
	r(new oc.BRepGProp_Face(face, false)).Normal(u, v, point, normal);
	return new Vector(normal);
}
function faceCenter(faceInput) {
	const oc = getOC();
	const properties = new oc.GProp_GProps();
	oc.BRepGProp.SurfaceProperties(unwrapShape(faceInput), properties, 1e-7, true);
	const center = new Vector(properties.CentreOfMass());
	properties.delete();
	return center;
}
//#endregion
//#region src/shapeFunctions/topology.ts
var TOPOLOGY_KINDS = [
	"vertex",
	"edge",
	"wire",
	"face",
	"shell",
	"solid",
	"solidCompound",
	"compound"
];
var buildDefinitions = (oc) => {
	const ta = oc.TopAbs_ShapeEnum;
	const shapeEnum = {
		vertex: ta.TopAbs_VERTEX,
		edge: ta.TopAbs_EDGE,
		wire: ta.TopAbs_WIRE,
		face: ta.TopAbs_FACE,
		shell: ta.TopAbs_SHELL,
		solid: ta.TopAbs_SOLID,
		solidCompound: ta.TopAbs_COMPSOLID,
		compound: ta.TopAbs_COMPOUND,
		shape: ta.TopAbs_SHAPE
	};
	return {
		shapeEnum,
		kindOf: new Map(TOPOLOGY_KINDS.map((kind) => [shapeEnum[kind], kind])),
		downcast: {
			shape: (shape) => shape,
			vertex: (shape) => oc.TopoDS.Vertex(shape),
			edge: (shape) => oc.TopoDS.Edge(shape),
			wire: (shape) => oc.TopoDS.Wire(shape),
			face: (shape) => oc.TopoDS.Face(shape),
			shell: (shape) => oc.TopoDS.Shell(shape),
			solid: (shape) => oc.TopoDS.Solid(shape),
			solidCompound: (shape) => oc.ReplicadShapeCaster.CompSolid(shape),
			compound: (shape) => oc.TopoDS.Compound(shape)
		}
	};
};
var cache = null;
var definitions = () => {
	const oc = getOC();
	if (cache?.oc !== oc) cache = {
		oc,
		definitions: buildDefinitions(oc)
	};
	return cache.definitions;
};
var asTopo = (entity) => definitions().shapeEnum[entity];
var downcastTo = (shape, entity) => definitions().downcast[entity](shape);
function* iterTopo(shape, topo) {
	const explorer = new (getOC()).TopExp_Explorer(shape, asTopo(topo), asTopo("shape"));
	try {
		const seen = [];
		while (explorer.More()) {
			const item = explorer.Current();
			if (!seen.some((s) => s.IsSame(item))) {
				seen.push(item);
				yield downcastTo(item, topo);
			}
			explorer.Next();
		}
	} finally {
		explorer.delete();
	}
}
var shapeType = (shape) => {
	if (shape.IsNull()) throw new Error("This shape has not type, it is null");
	return shape.ShapeType();
};
function topologyKind(shape) {
	return definitions().kindOf.get(shapeType(shape));
}
function downcast(shape) {
	const kind = topologyKind(shape);
	if (!kind) throw new Error(`Unsupported topology type: ${shapeType(shape)}`);
	return definitions().downcast[kind](shape);
}
//#endregion
//#region src/shapeFunctions/operations.ts
var configureGlue = (builder, optimisation) => {
	const oc = getOC();
	if (optimisation === "commonFace") builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
	if (optimisation === "sameFace") builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
};
/** Builds a raw shape by fusing two shapes. */
function fuseShapes(leftInput, rightInput, { optimisation = "none" } = {}) {
	const oc = getOC();
	const builder = GCWithScope()(new oc.BRepAlgoAPI_Fuse(unwrapShape(leftInput), unwrapShape(rightInput)));
	configureGlue(builder, optimisation);
	builder.Build();
	builder.SimplifyResult(true, true, .001);
	return builder.Shape();
}
/** Builds a raw shape by cutting a tool shape from another shape. */
function cutShape(shapeInput, toolInput, { optimisation = "none" } = {}) {
	const oc = getOC();
	const builder = GCWithScope()(new oc.BRepAlgoAPI_Cut(unwrapShape(shapeInput), unwrapShape(toolInput)));
	configureGlue(builder, optimisation);
	builder.Build();
	builder.SimplifyResult(true, true, .001);
	return builder.Shape();
}
/** Builds a raw shape containing the intersection of two shapes. */
function intersectShapes(leftInput, rightInput) {
	const oc = getOC();
	const builder = GCWithScope()(new oc.BRepAlgoAPI_Common(unwrapShape(leftInput), unwrapShape(rightInput)));
	builder.Build();
	builder.SimplifyResult(true, true, .001);
	return builder.Shape();
}
var signedDistanceToPlane = (point, plane) => (point[0] - plane.origin.x) * plane.zDir.x + (point[1] - plane.origin.y) * plane.zDir.y + (point[2] - plane.origin.z) * plane.zDir.z;
/**
* Splits a shape with an oriented plane and groups pieces by side.
*
* `offset` translates the splitting plane along its normal. A side is null
* when empty, the piece itself when it contains one piece, and a compound when
* it contains multiple disconnected pieces.
*/
function splitShape(shapeInput, inputPlane = "XY", offset = 0, tolerance = 1e-7) {
	const oc = getOC();
	const r = GCWithScope();
	const shape = unwrapShape(shapeInput);
	const basePlane = r(makePlane(inputPlane));
	const plane = offset === 0 ? basePlane : r(basePlane.translate([
		basePlane.zDir.x * offset,
		basePlane.zDir.y * offset,
		basePlane.zDir.z * offset
	]));
	const ocPlane = r(makePln(plane.origin, plane.zDir));
	const splittingFace = r(r(new oc.BRepBuilderAPI_MakeFace(ocPlane)).Face());
	const argumentsList = r(new oc.NCollection_List_TopoDS_Shape());
	argumentsList.Append(shape);
	const toolsList = r(new oc.NCollection_List_TopoDS_Shape());
	toolsList.Append(splittingFace);
	const builder = r(new oc.BRepAlgoAPI_Splitter());
	builder.SetArguments(argumentsList);
	builder.SetTools(toolsList);
	builder.Build();
	if (builder.HasErrors()) throw new Error("Could not split shape with plane");
	const splitResult = builder.Shape();
	const pieces = splitResult.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SOLID ? [oc.TopoDS.Solid(splitResult)] : [...iterTopo(splitResult, "solid")];
	splitResult.delete();
	const grouped = {
		positive: [],
		negative: [],
		on: []
	};
	for (const piece of pieces) {
		const bounds = r(new oc.Bnd_Box());
		oc.BRepBndLib.Add(piece, bounds, true);
		const min = r(bounds.CornerMin());
		const max = r(bounds.CornerMax());
		const distance = signedDistanceToPlane([
			(min.X() + max.X()) / 2,
			(min.Y() + max.Y()) / 2,
			(min.Z() + max.Z()) / 2
		], plane);
		if (distance > tolerance) grouped.positive.push(piece);
		else if (distance < -tolerance) grouped.negative.push(piece);
		else grouped.on.push(piece);
	}
	const asShape = (group) => {
		if (!group.length) return null;
		if (group.length === 1) return group[0];
		const compound = new oc.TopoDS_Compound();
		const compoundBuilder = r(new oc.TopoDS_Builder());
		compoundBuilder.MakeCompound(compound);
		group.forEach((piece) => compoundBuilder.Add(compound, piece));
		group.forEach((piece) => piece.delete());
		return compound;
	};
	return {
		positive: asShape(grouped.positive),
		negative: asShape(grouped.negative),
		on: asShape(grouped.on)
	};
}
/**
* Cuts a shape with the half-space defined by an oriented plane.
*
* `keep` identifies the side that remains. Positive is the direction of the
* plane normal. The offset translates the plane along that normal.
*/
function cutShapeWithPlane(shapeInput, inputPlane = "XY", offset = 0, keep = "positive") {
	const oc = getOC();
	const r = GCWithScope();
	const shape = unwrapShape(shapeInput);
	const basePlane = r(makePlane(inputPlane));
	const plane = offset === 0 ? basePlane : r(basePlane.translate([
		basePlane.zDir.x * offset,
		basePlane.zDir.y * offset,
		basePlane.zDir.z * offset
	]));
	const ocPlane = r(makePln(plane.origin, plane.zDir));
	const face = r(r(new oc.BRepBuilderAPI_MakeFace(ocPlane)).Face());
	const removedSign = keep === "negative" ? 1 : -1;
	const referencePoint = r(asPnt([
		plane.origin.x + plane.zDir.x * removedSign,
		plane.origin.y + plane.zDir.y * removedSign,
		plane.origin.z + plane.zDir.z * removedSign
	]));
	const halfSpace = r(r(new oc.BRepPrimAPI_MakeHalfSpace(face, referencePoint)).Solid());
	const builder = r(new oc.BRepAlgoAPI_Cut(shape, halfSpace));
	builder.Build();
	if (builder.HasErrors()) throw new Error("Could not cut shape with plane");
	const cutResult = builder.Shape();
	const solids = cutResult.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SOLID ? [oc.TopoDS.Solid(cutResult)] : [...iterTopo(cutResult, "solid")];
	cutResult.delete();
	if (!solids.length) return null;
	if (solids.length === 1) return solids[0];
	const compound = new oc.TopoDS_Compound();
	const compoundBuilder = r(new oc.TopoDS_Builder());
	compoundBuilder.MakeCompound(compound);
	solids.forEach((solid) => compoundBuilder.Add(compound, solid));
	solids.forEach((solid) => solid.delete());
	return compound;
}
/**
* Hollows a shape by removing the supplied faces and retaining a wall of the
* requested thickness.
*/
function shellShape(shapeInput, { faces, thickness, tolerance = .001 }) {
	const oc = getOC();
	const r = GCWithScope();
	const facesToRemove = r(new oc.NCollection_List_TopoDS_Shape());
	for (const face of faces) facesToRemove.Append(unwrapShape(face));
	const builder = r(new oc.BRepOffsetAPI_MakeThickSolid());
	builder.MakeThickSolidByJoin(unwrapShape(shapeInput), facesToRemove, -thickness, tolerance, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
	return builder.Shape();
}
/** Applies a draft angle to the supplied faces of a shape. */
function draftShape(shapeInput, { faces, angle, neutralPlane = "XY" }) {
	const oc = getOC();
	const shape = unwrapShape(shapeInput);
	const builder = new oc.BRepOffsetAPI_DraftAngle(shape);
	const inputPlane = makePlane(neutralPlane);
	const plane = makePln(inputPlane.origin, inputPlane.zDir);
	const direction = asDir(inputPlane.zDir);
	for (const face of faces) builder.Add(unwrapShape(face), direction, angle * DEG2RAD, plane, false);
	builder.Build();
	const result = builder.ModifiedShape(shape);
	builder.delete();
	plane.delete();
	direction.delete();
	inputPlane.delete();
	return result;
}
//#endregion
//#region src/shapeFunctions/edgeOperations.ts
function isFilletRadius(radius) {
	if (typeof radius === "number") return true;
	return Array.isArray(radius) && radius.length === 2 && radius.every((value) => typeof value === "number");
}
/**
* Normalizes a radius callback, a filter configuration, or a radius applying
* to every edge into a lazy sequence of explicit edge/radius pairs.
*
* Temporary edge wrappers remain alive while each yielded value is consumed
* and are deleted before advancing to the next edge.
*/
function* selectEdgeRadii(shapeInput, radiusConfig, isRadius, wrapEdge) {
	const shape = unwrapShape(shapeInput);
	if (isRadius(radiusConfig)) {
		for (const edge of iterTopo(shape, "edge")) yield {
			edge,
			radius: radiusConfig
		};
		return;
	}
	let radiusForEdge;
	let filterToDelete = null;
	if (typeof radiusConfig === "function") radiusForEdge = radiusConfig;
	else {
		radiusForEdge = (edge) => radiusConfig.filter.shouldKeep(edge) ? radiusConfig.radius || 1 : null;
		if (!radiusConfig.keep) filterToDelete = radiusConfig.filter;
	}
	try {
		for (const edge of iterTopo(shape, "edge")) {
			const wrappedEdge = wrapEdge(edge);
			try {
				const radius = radiusForEdge(wrappedEdge);
				if (radius) yield {
					edge,
					radius
				};
			} finally {
				wrappedEdge.delete();
			}
		}
	} finally {
		filterToDelete?.delete();
	}
}
function* mapSelectedEdges(edges, map) {
	for (const selected of edges) yield map(selected);
}
function filletShape(shapeInput, edges) {
	const oc = getOC();
	const builder = GCWithScope()(new oc.BRepFilletAPI_MakeFillet(unwrapShape(shapeInput), oc.ChFi3d_FilletShape.ChFi3d_Rational));
	let edgeCount = 0;
	for (const { radius, edge: edgeInput } of edges) {
		const edge = unwrapShape(edgeInput);
		if (typeof radius === "number") builder.Add(radius, edge);
		else builder.Add(radius[0], radius[1], edge);
		edgeCount += 1;
	}
	if (!edgeCount) throw new Error("Could not fillet, no edge was selected");
	return builder.Shape();
}
function chamferShape(shapeInput, edges) {
	const oc = getOC();
	const builder = GCWithScope()(new oc.BRepFilletAPI_MakeChamfer(unwrapShape(shapeInput)));
	let edgeCount = 0;
	for (const config of edges) {
		const edge = unwrapShape(config.edge);
		if ("radius" in config) builder.Add(config.radius, edge);
		else if ("distances" in config) builder.Add(config.distances[0] ?? 1, config.distances[1] ?? 1, edge, unwrapShape(config.face));
		else builder.AddDA(config.distance, config.angle * DEG2RAD, edge, unwrapShape(config.face));
		edgeCount += 1;
	}
	if (!edgeCount) throw new Error("Could not chamfer, no edge was selected");
	return builder.Shape();
}
//#endregion
//#region src/shapeFunctions/casting.ts
/**
* Builds a cast function from the concrete wrappers to instantiate.
*
* This keeps the casting module independent from the wrapper classes, while
* letting the caller keep the mapping fully typed.
*/
function makeCaster(constructors) {
	return (shape) => {
		const kind = topologyKind(shape);
		if (!kind) throw new Error(`Unsupported topology type: ${shapeType(shape)}`);
		return new constructors[kind](downcast(shape));
	};
}
//#endregion
export { isPoint as $, exportShapeSTEP as A, makePlaneFromFace as B, Curve as C, curveType as D, curveTangentAt as E, prepareShapeForMesh as F, AXIS_NAMES as G, rotate as H, triangulateFace as I, Transformation as J, BoundingBox as K, unwrapShape as L, serializeShape as M, mesh as N, surfaceType as O, meshEdges as P, createNamedPlane as Q, findCurveType as R, pointOnFace as S, curvePointAt as T, scale as U, mirror as V, translate as W, asDir as X, Vector as Y, asPnt as Z, topologyKind as _, mapSelectedEdges as a, makePln as at, faceUVBounds as b, cutShapeWithPlane as c, HASH_CODE_MAX as ct, intersectShapes as d, GCWithScope as dt, makeAx1 as et, shellShape as f, WrappingObj as ft, shapeType as g, iterTopo as h, setOC as ht, isFilletRadius as i, makeDirection as it, exportShapeSTL as j, deserializeTopoShape as k, draftShape as l, RAD2DEG as lt, downcast as m, getOC as mt, chamferShape as n, makeAx3 as nt, selectEdgeRadii as o, resolveDirection as ot, splitShape as p, localGC as pt, Plane as q, filletShape as r, makeDirVector as rt, cutShape as s, DEG2RAD as st, makeCaster as t, makeAx2 as tt, fuseShapes as u, GCWithObject as ut, faceCenter as v, Surface as w, faceUVCoordinates as x, faceNormalAt as y, makePlane as z };

