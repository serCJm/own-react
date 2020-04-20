function createElement(
	type: string,
	props: object,
	...children: (string | number)[]
): object {
	return {
		type,
		props: {
			...props,
			children: children.map((child: string | number) =>
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

type Didact = {
	createElement: Function;
};

const Didact: Didact = {
	createElement,
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
