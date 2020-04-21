interface createdElement {
	type: string;
	props: {
		[propName: string]: any;
		children: any[];
	};
}

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

function createDom(fiber: createdElement): HTMLElement | Text {
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
}

function commitRoot() {
	// add nodes to dom
	commitWork(wipRoot.child);
	wipRoot = null;
}
function commitWork(fiber) {
	if (!fiber) {
		return;
	}
	const domParent = fiber.parent.dom;
	domParent.appendChild(fiber.dom);
	commitWork(fiber.child);
	commitWork(fiber.sibling);
}

function render(element: createdElement, container: HTMLElement) {
	wipRoot = {
		dom: container,
		props: {
			children: [element],
		},
	};
	// set next unit of work
	nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let wipRoot = null;

function workLoop(deadline) {
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
function performUnitOfWork(fiber) {
	// add dom node
	if (!fiber.dom) {
		fiber.dom = createDom(fiber);
	}
	if (fiber.parent) {
		fiber.parent.dom.appendChild(fiber.dom);
	}

	// create new fibers
	const elements = fiber.props.children;
	let index = 0;
	let prevSibling = null;
	while (index < elements.length) {
		const element = elements[index];
		const newFiber = {
			type: element.type,
			props: element.props,
			parent: fiber,
			dom: null,
		};
		if (index === 0) {
			fiber.child = newFiber;
		} else {
			prevSibling.sibling = newFiber;
		}
		prevSibling = newFiber;
		index++;
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

// EXECUTION
type Didact = {
	createElement: Function;
	render: Function;
};

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
