const React = {
    createElement,
    render,
    useState,
}
let currentRoot = null
let deletions = null
let wipFiber = null
let wipRoot = null
let hookIndex = null
let nextUnitOfWork = null
const TEXT_ELEMENT = 'TEXT_ELEMENT'
const EFFECT_TAG = {
    UPDATE: 'UPDATE',
    PLACEMENT: 'PLACEMENT',
    DELETION: 'DELETION',
}

function createElement(type, props, ...children) {
    const ele = {
        type,
        props: {
            ...props,
            children: children.map(child  => typeof child === 'object' ? child : createTextElement(child))    
        }
    }

    return ele
}

function createTextElement(text) {
    return {
        type: TEXT_ELEMENT,
        props: {
            nodeValue: text,
            children: [],
        }
    }
}

function createDom(fiber) { 
    const dom = fiber.type === TEXT_ELEMENT ? 
        document.createTextNode('') :
        document.createElement(fiber.type)
    
    updateDom(dom, {}, fiber.props)

    return dom
}

const isProperty = k => k !== 'children'
const isEvent = k => k.startsWith('on')
const isNew = (prevProps, nextProps) => k => prevProps[k] !== nextProps[k]
const isGone = (prevProps, nextProps) => k => !(k in nextProps)
const getEventType = k => k.substring(2).toLowerCase()
function updateDom(dom, prevProps = {}, nextProps = {}) {
    // 事件 在nextProps上或者在nextProps移除的事件都要清理
    Object.keys(prevProps)
        .filter(isEvent)
        .filter(k => isGone(prevProps, nextProps)(k) || isNew(prevProps, nextProps)(k))
        .forEach(k => {
            dom.removeEventListener(getEventType(k), prevProps[k])
        })
    Object.keys(prevProps)
        .filter(isProperty)
        .filter(isGone(prevProps, nextProps))
        .forEach(k => {
            dom[k] = ''
        })
    Object.keys(nextProps)
        .filter(isProperty)
        
        .filter(isNew(prevProps, nextProps))
        .forEach(k => {
            dom[k] = nextProps[k]
        })
    Object.keys(nextProps)
        .filter(isEvent)
        .filter(isNew(prevProps, nextProps))
        .forEach(k => {
            dom.addEventListener(getEventType(k), nextProps[k])
        })
}

function render(ele, container) { 
    // 初始化节点信息，进入时间循环
    wipRoot = {
        dom: container, // 初始 node
        props: {
            children: [ele], 
        },
        alternate: currentRoot, // 上一次 fiber tree, 用来对比
    }
    deletions = []
    nextUnitOfWork = wipRoot
}

function workLoop(deadline) {
    // 不断的事件循环，如果浏览器线程阻塞或者没有任务（渲染任务）就放弃这次循环
    let shouldYield = false

    while (nextUnitOfWork && !shouldYield) {
        // 处理 fiber tree 的关系
        // 这行单元渲染任务
        nextUnitOfWork = preformUnitWork(nextUnitOfWork)
        // 可以让你判断用户代理(浏览器)还剩余多少闲置时间可以用来执行耗时任务
        shouldYield = deadline.timeRemaining() < 1 
    }

    if (!nextUnitOfWork && wipRoot) {
        commitRoot()
    }

    // 下一次事件循环
    requestIdleCallback(workLoop)
}

function preformUnitWork(fiber) {
    const isFunctionComponent = fiber.type instanceof Function

    if (isFunctionComponent) {
        updateFunctionComponent(fiber)
    } else {
        updateHostComponent(fiber)
    }

    if (fiber.child) {
        return fiber.child
    }

    let nextFiber = fiber
    while (nextFiber) { 
        if (nextFiber.sibling) {
            return nextFiber.sibling
        }

        nextFiber = nextFiber.parent
    }
}

function updateHostComponent(fiber) { 
    if (!fiber.dom) {
        fiber.dom = createDom(fiber)
    }

    const elements = fiber.props.children
    reconcileChildren(fiber, elements)
}

function updateFunctionComponent(fiber) {
    wipFiber = fiber
    hookIndex = 0 // 判断调用的hook的索引
    wipFiber.hooks = [] 
    let children = [fiber.type(fiber.props)]
    reconcileChildren(fiber, children)
}

// 处理当前 fiber.children 的数据结构和关系
function reconcileChildren(wipFiber, elements) {
    let index = 0 // child index
    let oldFiber = wipFiber.alternate && wipFiber.alternate.child // 与当前child相应的oldFiber
    let prevSibling = null // 上一个child
    
    // 循环：有child 待遍历 或者 oldFiber 未处理完
    while (index < elements.length || oldFiber != null) {
        const ele = elements[index]
        let newFiber = null
        // 类型相同
        const sameType = oldFiber && ele && ele.type === oldFiber.type 
        if (sameType) {
            newFiber = {
                type: oldFiber.type,
                props: ele.props,
                dom: oldFiber.dom,
                parent: wipFiber,
                alternate: oldFiber,
                effectTag: EFFECT_TAG.UPDATE, 
            }
        }

        if (ele && !sameType) {
            newFiber = {
                type: ele.type,
                props: ele.props,
                dom: null,
                parent: wipFiber,
                alternate: null,
                effectTag: EFFECT_TAG.PLACEMENT,
            }
        }

        if (oldFiber && !sameType) {
            oldFiber.effectTag = EFFECT_TAG.DELETION
            deletions.push(oldFiber)
        }

        if (oldFiber) {
            oldFiber = oldFiber.sibling
        }

        if (index === 0) {
            wipFiber.child = newFiber
        } else if (ele) {
            prevSibling.sibling = newFiber
        }

        prevSibling = newFiber
        index++
    }
}

function commitRoot() {
    deletions.forEach(commitWork)
    commitWork(wipRoot.child)
    currentRoot = wipRoot
    wipRoot = null
}

function commitWork(fiber) { 
    if (!fiber) {
        return
    }

    let parentFiber = fiber.parent
    while (!parentFiber.dom) {
        parentFiber = parentFiber.parent
    }
    let domParent = parentFiber.dom

    if (fiber.effectTag === EFFECT_TAG.PLACEMENT && fiber.dom != null) {
        domParent.appendChild(fiber.dom)
    } else if (fiber.effectTag === EFFECT_TAG.UPDATE) {
        updateDom(fiber.dom, fiber.alternate.props, fiber.props)
    } else if (fiber.effectTag === EFFECT_TAG.DELETION) {
        commitDeletion(fiber, domParent)
    }

    commitWork(fiber.child)
    commitWork(fiber.sibling)
}

function commitDeletion(fiber, domParent) {
    if (fiber.dom) {
        domParent.removeChild(fiber.dom)
    } else {
        commitDeletion(fiber.child, domParent)
    }
}

function useState(initial) { 
    const oldHook = wipFiber?.alternate?.hooks?.[hookIndex]
    const hook = {
        state: oldHook ? oldHook.state : initial,
        queue: [],
    }

    // 更新 state, 执行上一次 setState
    const actions = oldHook ? oldHook.queue : []
    actions.forEach(action => {
        hook.state = typeof action === 'function' ? action(hook.state) : action
    })

    /**
     * 
     * @param {*} action
     * action push 调用队列
     * 重新执行 render， 下次render 的时候会调用这个action，更新state
     */
    const setState = action => {
        hook.queue.push(action)
        wipRoot = {
            dom: currentRoot.dom,
            props: currentRoot.props,
            alternate: currentRoot,
        }
        nextUnitOfWork = wipRoot
        deletions = []
    }

    wipFiber.hooks.push(hook)
    hookIndex++

    return [hook.state, setState]
}

requestIdleCallback(workLoop)