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
