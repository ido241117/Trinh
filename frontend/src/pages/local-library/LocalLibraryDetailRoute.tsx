import { useNavigate, useParams } from 'react-router-dom'
import { localLibraryReadPath } from '../../routes/paths'
import LocalLibraryDetailPage from './LocalLibraryDetailPage'

export default function LocalLibraryDetailRoute() {
  const { bookId = '' } = useParams<{ bookId: string }>()
  const navigate = useNavigate()

  return (
    <LocalLibraryDetailPage
      bookId={bookId}
      onBack={() => navigate('/local-library')}
      onRead={() => navigate(localLibraryReadPath(bookId))}
      onDeleted={() => navigate('/local-library')}
    />
  )
}
