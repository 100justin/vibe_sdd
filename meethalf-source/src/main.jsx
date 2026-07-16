import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 예상치 못한 렌더링 오류가 나도 검은 화면 대신 원인을 알 수 있게 표시한다.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          background: '#12151A', color: '#EDEDE5', fontFamily: 'monospace',
          padding: 24, textAlign: 'center',
        }}>
          <p>문제가 발생했어요: {this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #2E3440', background: '#1B1F27', color: '#EDEDE5', cursor: 'pointer' }}
          >새로고침</button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
