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
	hooks?: any[];
}

type Didact = {
	createElement: Function;
	render: Function;
	useState: Function;
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

	let domParentFiber = fiber.parent;
	while (!domParentFiber.dom) {
		domParentFiber = domParentFiber.parent;
	}
	const domParent = domParentFiber.dom as HTMLElement;

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
		commitDeletion(fiber, domParent);
	}
	commitWork(fiber.child);
	commitWork(fiber.sibling);
}

function commitDeletion(fiber: Fiber, domParent: Dom): void {
	if (fiber.dom && domParent instanceof Node) {
		domParent.removeChild(fiber.dom as HTMLElement);
	} else {
		commitDeletion(fiber.child, domParent);
	}
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
	const isFunctionComponent = (fiber.type as any) instanceof Function;
	if (isFunctionComponent) {
		updateFunctionComponent(fiber);
	} else {
		updateHostComponent(fiber);
	}

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

function updateFunctionComponent(fiber: Fiber): void {
	const funcFiber: any = fiber.type;
	const children = [funcFiber(fiber.props)];
	reconcileChildren(fiber, children);
}

let wipFiber: Fiber = null;
let hookIndex = null;

function updateHostComponent(fiber: Fiber): void {
	wipFiber = fiber;
	hookIndex = 0;
	wipFiber.hooks = [];

	if (!fiber.dom) {
		fiber.dom = createDom(fiber);
	}
	reconcileChildren(fiber, fiber.props.children);
}

function useState(initial: any) {
	const oldHook =
		wipFiber.alternate &&
		wipFiber.alternate.hooks &&
		wipFiber.alternate.hooks[hookIndex];
	const hook = {
		state: oldHook ? oldHook.state : initial,
		queue: [],
	};

	const actions = oldHook ? oldHook.queue : [];
	actions.forEach((action) => {
		hook.state = action(hook.state);
	});

	const setState = (action) => {
		hook.queue.push(action);
		wipRoot = {
			dom: currentRoot.dom,
			props: currentRoot.props,
			alternate: currentRoot,
		};
		nextUnitOfWork = wipRoot;
		deletions = [];
	};
	wipFiber.hooks.push(hook);
	hookIndex++;
	return [hook.state, setState];
}

function reconcileChildren(wipFiber: Fiber, elements: any[]): void {
	let index = 0;
	let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
	let prevSibling = null;

	while (index < elements.length || oldFiber != null) {
		const element = elements[index];
		let newFiber = null;

		const sameType = oldFiber && element && element.type == oldFiber.type;

		if (sameType) {
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
			oldFiber.effectTag = EffectTag.DELETION;
			deletions.push(oldFiber);
		}

		if (oldFiber) {
			oldFiber = oldFiber.sibling;
		}

		if (index === 0) {
			wipFiber.child = newFiber;
		} else if (element) {
			prevSibling.sibling = newFiber;
		}

		prevSibling = newFiber;
		index++;
	}
}

// EXECUTION
const Didact: Didact = {
	createElement,
	render,
	useState,
};
const element = Didact.createElement(
	"div",
	{ id: "foo" },
	Didact.createElement("a", null, "bar"),
	Didact.createElement("b")
);

const container = document.getElementById("root") as HTMLElement;
Didact.render(element, container);

/** @jsx Didact.createElement */
// const element:any = (
// 	<div id="foo">
// 		<a>bar</a>
// 		<b />
// 	</div>
// );

// Functional component
// /** @jsx Didact.createElement */
// function App(props) {
// 	return <h1>Hi {props.name}</h1>
//   }
// const element = <App name="foo" />;
// const container = document.getElementById("root");
// Didact.render(element, container);

// In JS:
// function App(props) {
// 	return Didact.createElement(
// 	  "h1",
// 	  null,
// 	  "Hi ",
// 	  props.name
// 	)
//   }
//   const element = Didact.createElement(App, {
// 	name: "foo",
//   })

// HOOKS
// function Counter() {
// 	const [state, setState] = Didact.useState(1)
// 	return (
// 	  <h1 onClick={() => setState(c => c + 1)}>
// 		Count: {state}
// 	  </h1>
// 	)
//   }
//   const element = <Counter />
//   const container = document.getElementById("root")
//   Didact.render(element, container)
