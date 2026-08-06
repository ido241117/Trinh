import { useNavigate, useParams } from 'react-router-dom'
import { localLibraryBookPath } from '../../routes/paths'
import LocalLibraryReadPage from './LocalLibraryReadPage'

export default function LocalLibraryReadRoute() {
  const { bookId = '' } = useParams<{ bookId: string }>()
  const navigate = useNavigate()

  return (
    <LocalLibraryReadPage
      bookId={bookId}
      onBack={() => navigate(localLibraryBookPath(bookId))}
    />
  )
}
