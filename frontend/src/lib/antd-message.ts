import { message } from 'antd'
import type { ArgsProps, JointContent, TypeOpen } from 'antd/es/message/interface'

const ERROR_TOAST_CLASS = 'app-message-error'
let errorToastSeq = 0

function isArgsProps(content: JointContent): content is ArgsProps {
  return Boolean(content) && typeof content === 'object' && 'content' in content
}

function hasTextSelection(): boolean {
  return Boolean(window.getSelection()?.toString())
}

export function toStickyErrorConfig(
  content: JointContent,
  duration?: number | VoidFunction,
  onClose?: VoidFunction,
): ArgsProps & { closable?: boolean } {
  const fromConfig = isArgsProps(content)
  const config: ArgsProps & { closable?: boolean } = fromConfig
    ? { ...content }
    : { content }

  const key = config.key ?? `error-${++errorToastSeq}`
  const prevOnClick = config.onClick
  const prevOnClose = config.onClose
  const closeFromArgs = typeof duration === 'function' ? duration : onClose

  config.key = key
  config.duration = 0
  config.closable = true
  config.className = [config.className, ERROR_TOAST_CLASS].filter(Boolean).join(' ')
  config.onClose = () => {
    prevOnClose?.()
    if (!fromConfig) closeFromArgs?.()
  }
  config.onClick = event => {
    prevOnClick?.(event)
    if (hasTextSelection()) return
    message.destroy(key)
  }

  return config
}

const originalError = message.error.bind(message)

message.error = ((content, duration, onClose) =>
  originalError(toStickyErrorConfig(content, duration, onClose))) as TypeOpen
