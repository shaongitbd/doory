import { msg } from '@/i18n/catalog'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface State {
  failed: boolean
}

/** Last line of defence for errors thrown outside the router (providers, bootstrap). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled application error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={styles.page} role="alert">
        <h1 className={styles.title}>{msg("Something went wrong")}</h1>
        <p className={styles.text}>{msg("Doory hit an unexpected problem. Reloading usually fixes it, and anything you saved is safe.")}</p>
        <button type="button" className={styles.button} onClick={() => window.location.reload()}>
          {msg("Reload page")}</button>
      </div>
    )
  }
}
