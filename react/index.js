
function Input() {
    const [v, setV] = React.useState('hello world')
    console.log('v ========================> ', v)
    return React.createElement(
        'div',
        {
            style: `
                display:flex; flex-direction: column;
            `
        },
        React.createElement(
            'input',
            {   
                value: v,
                onChange: (e) => {
                    setV(e.target.value)       
                }
            },
            ),
        React.createElement('h3', {
            style: 'color: blue; font-size: 20px;',
        }, v)
    )
}
    
React.render(
    React.createElement(Input),
    document.getElementById('root')
)


