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

function render(element: createdElement, container: HTMLElement) {
	const dom = document.createElement(element.type);
	element.props.children.forEach((child) => render(child, dom));
	container.appendChild(dom);
}

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
// ReactDOM.render(element, container)
