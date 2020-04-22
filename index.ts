enum EffectTag {
	UPDATE,
	PLACEMENT,
	DELETION,
}

interface Props {
	[propName: string]: any;
	children: any[];
}

interface createdElement {
	type: string;
	props: Props;
}

interface createDom {
	(fiber: createdElement): HTMLElement | Text;
}

interface Deadline {
	didTimeout: boolean;
	timeRemaining: Function;
}

type Dom = createDom | HTMLElement | Text;

interface Fiber {
	type: string;
	props: Props;
	dom: Dom;
	parent: Fiber;
	child?: Fiber;
	sibling?: Fiber;
	alternate?: Fiber;
	effectTag: EffectTag;
}

type Didact = {
	createElement: Function;
	render: Function;
};

function createElement(
	type: string,
	props: object,
	...children: (object | string | number)[]
): createdElement {
	return {
		type,
		props: {
			...props,
			children: children.map((child: string | number | object) =>
				typeof child === "object" ? child : createTextElement(child)
			),
		},
	};
}

function createTextElement(text: string | number): object {
	return {
		type: "TEXT_ELEMENT",
		props: {
			nodeValue: text,
			children: [],
		},
	};
}

// changed in favor of concurrent mode
// function render(element: createdElement, container: HTMLElement | Text) {
// 	const dom =
// 		element.type == "TEXT_ELEMENT"
// 			? document.createTextNode("")
// 			: document.createElement(element.type);

// 	const isProperty = (key: string) => key !== "children";
// 	Object.keys(element.props)
// 		.filter(isProperty)
// 		.forEach((name) => {
// 			dom[name] = element.props[name];
// 		});

// 	element.props.children.forEach((child) => render(child, dom));
// 	container.appendChild(dom);
// }

// CONCURRENT MODE
// Once we start rendering, we won’t stop until we have rendered the complete element tree. If the element tree is big, it may block the main thread for too long. And if the browser needs to do high priority stuff like handling user input or keeping an animation smooth, it will have to wait until the render finishes.

// So we are going to break the work into small units, and after we finish each unit we’ll let the browser interrupt the rendering if there’s anything else that needs to be done.

// To organize the units of work we’ll need a data structure: a fiber tree.
// One of the goals of this data structure is to make it easy to find the next unit of work. That’s why each fiber has a link to its first child, its next sibling and its parent.
// When we finish performing work on a fiber, if it has a child that fiber will be the next unit of work.
// If the fiber doesn’t have a child, we use the sibling as the next unit of work.
// And if the fiber doesn’t have a child nor a sibling we go to the “uncle”: the sibling of the parent.

let createDom: createDom;

createDom = function (fiber) {
	const dom =
		fiber.type == "TEXT_ELEMENT"
			? document.createTextNode("")
			: document.createElement(fiber.type);
	const isProperty = (key) => key !== "children";
	Object.keys(fiber.props)
		.filter(isProperty)
		.forEach((name) => {
			dom[name] = fiber.props[name];
		});
	return dom;
};

const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
// We compare the props from the old fiber to the props of the new fiber, remove the props that are gone, and set the props that are new or changed.
function updateDom(dom: Dom, prevProps: Props, nextProps: Props): void {
	//Remove old or changed event listeners
	Object.keys(prevProps)
		.filter(isEvent)
		.filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
		.forEach((name) => {
			const eventType = name.toLowerCase().substring(2);
			if (dom instanceof Node)
				dom.removeEventListener(eventType, prevProps[name]);
		});
	// Remove old properties
	Object.keys(prevProps)
		.filter(isProperty)
		.filter(isGone(prevProps, nextProps))
		.forEach((name) => {
			dom[name] = "";
		});
	// Set new or changed properties
	Object.keys(nextProps)
		.filter(isProperty)
		.filter(isNew(prevProps, nextProps))
		.forEach((name) => {
			dom[name] = nextProps[name];
		});
	// Add event listeners
	Object.keys(nextProps)
		.filter(isEvent)
		.filter(isNew(prevProps, nextProps))
		.forEach((name) => {
			const eventType = name.toLowerCase().substring(2);
			if (dom instanceof Node) dom.addEventListener(eventType, nextProps[name]);
		});
}

function commitRoot(): void {
	deletions.forEach(commitWork);
	// add nodes to dom
	commitWork(wipRoot.child);
	currentRoot = wipRoot;
	wipRoot = null;
}
function commitWork(fiber: Fiber) {
	if (!fiber) {
		return;
	}
	const domParent = fiber.parent.dom as HTMLElement;

	if (
		fiber.effectTag === EffectTag.PLACEMENT &&
		fiber.dom != null &&
		fiber.dom instanceof Node
	) {
		domParent.appendChild(fiber.dom);
	} else if (fiber.effectTag === EffectTag.UPDATE && fiber.dom != null) {
		updateDom(fiber.dom, fiber.alternate.props, fiber.props);
	} else if (
		fiber.effectTag === EffectTag.UPDATE &&
		fiber.dom instanceof Node
	) {
		domParent.removeChild(fiber.dom);
	}
	commitWork(fiber.child);
	commitWork(fiber.sibling);
}

function render(element: createdElement, container: HTMLElement): void {
	wipRoot = {
		dom: container,
		props: {
			children: [element],
		},
		alternate: currentRoot,
	};
	deletions = [];
	// set next unit of work
	nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let currentRoot = null;
let wipRoot = null;
let deletions = null;

function workLoop(deadline: Deadline): void {
	let shouldYield = false;
	while (nextUnitOfWork && !shouldYield) {
		nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
		shouldYield = deadline.timeRemaining() < 1;
	}

	if (!nextUnitOfWork && wipRoot) {
		commitRoot();
	}
	// We use requestIdleCallback to make a loop. You can think of requestIdleCallback as a setTimeout, but instead of us telling it when to run, the browser will run the callback when the main thread is idle.
	// requestIdleCallback also gives us a deadline parameter. We can use it to check how much time we have until the browser needs to take control again.
	(window as any).requestIdleCallback(workLoop);
}
(window as any).requestIdleCallback(workLoop);
// To start using the loop we’ll need to set the first unit of work, and then write a performUnitOfWork function that not only performs the work but also returns the next unit of work.

function performUnitOfWork(fiber: Fiber): Fiber {
	// add dom node
	if (!fiber.dom) {
		fiber.dom = createDom(fiber);
	}
	if (
		fiber.parent &&
		fiber.parent.dom instanceof Node &&
		fiber.dom instanceof Node
	) {
		fiber.parent.dom.appendChild(fiber.dom);
	}

	// create new fibers
	const elements = fiber.props.children;
	reconcileChildren(fiber, elements);

	// return next unit of work
	if (fiber.child) {
		return fiber.child;
	}
	let nextFiber = fiber;
	while (nextFiber) {
		if (nextFiber.sibling) {
			return nextFiber.sibling;
		}
		nextFiber = nextFiber.parent;
	}
}

function reconcileChildren(wipFiber: Fiber, elements: any[]): void {
	let index = 0;
	let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
	let prevSibling = null;

	while (index < elements.length || oldFiber != null) {
		// The element is the thing we want to render to the DOM and the oldFiber is what we rendered the last time.
		// We need to compare them to see if there’s any change we need to apply to the DOM.
		const element = elements[index];

		let newFiber = null;

		// compare oldFiber to element
		const sameType = oldFiber && element && element.type == oldFiber.type;
		// Here React also uses keys, that makes a better reconciliation. For example, it detects when children change places in the element array.
		if (sameType) {
			// update the node
			newFiber = {
				type: oldFiber.type,
				props: element.props,
				dom: oldFiber.dom,
				parent: wipFiber,
				alternate: oldFiber,
				effectTag: EffectTag.UPDATE,
			};
		}
		if (element && !sameType) {
			// add this node
			newFiber = {
				type: element.type,
				props: element.props,
				dom: null,
				parent: wipFiber,
				alternate: null,
				effectTag: EffectTag.PLACEMENT,
			};
		}
		if (oldFiber && !sameType) {
			// delete the oldFiber's node
			oldFiber.effectTag = EffectTag.DELETION;
			deletions.push(oldFiber);
		}
	}
}

// EXECUTION
const Didact: Didact = {
	createElement,
	render,
};
const element = Didact.createElement(
	"div",
	{ id: "foo" },
	Didact.createElement("a", null, "bar"),
	Didact.createElement("b")
);

/** @jsx Didact.createElement */
// const element:any = (
// 	<div id="foo">
// 		<a>bar</a>
// 		<b />
// 	</div>
// );

const container = document.getElementById("root") as HTMLElement;
Didact.render(element, container);
