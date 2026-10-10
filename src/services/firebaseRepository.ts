import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from './firebase';
import { UserProfile, CommunityPost, CommentItem, ChatMessage, PriceAlert, AdminReport, ReportItem, ChatRoomInfo } from '../types';

export const firebaseRepository = {
  // 1. Users
  async syncUserProfile(uid: string, email: string, displayName?: string, photoURL?: string): Promise<UserProfile> {
    const userRef = doc(db, 'users', uid);
    try {
      const snap = await getDoc(userRef);
      const isOwnerAdmin = email === 'byunghyunlim92@gmail.com';
      if (!snap.exists()) {
        const newUser: UserProfile = {
          id: uid,
          email,
          name: displayName || email.split('@')[0],
          avatar: photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
          role: isOwnerAdmin ? 'admin' : 'user',
          tier: isOwnerAdmin ? '총괄관리자' : '일반회원',
          joinedDate: new Date().toLocaleDateString('ko-KR'),
          bio: '스마트한 가치 투자를 지향합니다.',
          postCount: 0,
          commentCount: 0,
          winRate: 70,
        };
        await setDoc(userRef, {
          uid,
          email,
          nickname: newUser.name,
          displayName: newUser.name,
          photoURL: newUser.avatar,
          role: newUser.role,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          isActive: true,
          status: 'active',
        });
        return newUser;
      } else {
        const data = snap.data();
        await updateDoc(userRef, {
          lastLoginAt: new Date().toISOString(),
        });
        return {
          id: uid,
          email: data.email,
          name: data.nickname || data.displayName || '투자자',
          avatar: data.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
          role: isOwnerAdmin ? 'admin' : (data.role || 'user'),
          tier: isOwnerAdmin ? '총괄관리자' : (data.tier || '일반회원'),
          joinedDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('ko-KR') : '2026.01.15',
          bio: data.bio || '스마트한 가치 투자를 지향합니다.',
          postCount: data.postCount || 0,
          commentCount: data.commentCount || 0,
          winRate: data.winRate || 70,
        };
      }
    } catch (err) {
      console.warn('Firebase user sync failed, using local profile:', err);
      return {
        id: uid,
        email,
        name: displayName || '병돌투자자',
        avatar: photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
        role: email === 'byunghyunlim92@gmail.com' ? 'admin' : 'user',
        tier: email === 'byunghyunlim92@gmail.com' ? '총괄관리자' : '다이아 VIP',
        joinedDate: '2026.01.15',
        bio: '데이터 기반 퀀트 & 모멘텀 스윙 트레이더.',
        postCount: 14,
        commentCount: 86,
        winRate: 72.5,
      };
    }
  },

  // 2. Watchlists
  async getUserWatchlists(uid: string): Promise<string[]> {
    const path = 'watchlists';
    try {
      const q = query(collection(db, path), where('uid', '==', uid));
      const snap = await getDocs(q);
      const items: { symbol: string; orderIndex: number; createdAt: string }[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.symbol) {
          items.push({
            symbol: d.symbol,
            orderIndex: typeof d.orderIndex === 'number' ? d.orderIndex : 9999,
            createdAt: d.createdAt || '',
          });
        }
      });
      // Sort by orderIndex, then by createdAt
      items.sort((a, b) => (a.orderIndex - b.orderIndex) || a.createdAt.localeCompare(b.createdAt));
      return items.map(i => i.symbol);
    } catch (err) {
      console.warn('Firebase get watchlists failed:', err);
      handleFirestoreError(err, OperationType.LIST, path);
      return [];
    }
  },

  subscribeUserWatchlists(uid: string, callback: (symbols: string[]) => void): () => void {
    const path = 'watchlists';
    try {
      const q = query(collection(db, path), where('uid', '==', uid));
      return onSnapshot(q, snap => {
        const items: { symbol: string; orderIndex: number; createdAt: string }[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.symbol) {
            items.push({
              symbol: d.symbol,
              orderIndex: typeof d.orderIndex === 'number' ? d.orderIndex : 9999,
              createdAt: d.createdAt || '',
            });
          }
        });
        items.sort((a, b) => (a.orderIndex - b.orderIndex) || a.createdAt.localeCompare(b.createdAt));
        callback(items.map(i => i.symbol));
      }, err => {
        console.warn('Watchlists onSnapshot error:', err);
        handleFirestoreError(err, OperationType.GET, path);
      });
    } catch (err) {
      console.warn('subscribeUserWatchlists exception:', err);
      handleFirestoreError(err, OperationType.GET, path);
      return () => {};
    }
  },

  async addWatchlist(uid: string, symbol: string, orderIndex?: number): Promise<void> {
    const docPath = `watchlists/${uid}_${symbol}`;
    try {
      const docId = `${uid}_${symbol}`;
      await setDoc(doc(db, 'watchlists', docId), {
        uid,
        symbol,
        orderIndex: typeof orderIndex === 'number' ? orderIndex : Date.now(),
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Firebase add watchlist error:', err);
      handleFirestoreError(err, OperationType.WRITE, docPath);
    }
  },

  async removeWatchlist(uid: string, symbol: string): Promise<void> {
    const docPath = `watchlists/${uid}_${symbol}`;
    try {
      const docId = `${uid}_${symbol}`;
      await deleteDoc(doc(db, 'watchlists', docId));
    } catch (err) {
      console.warn('Firebase remove watchlist error:', err);
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  },

  async updateWatchlistOrder(uid: string, symbols: string[]): Promise<void> {
    const path = 'watchlists';
    try {
      const promises = symbols.map((symbol, idx) => {
        const docId = `${uid}_${symbol}`;
        return updateDoc(doc(db, 'watchlists', docId), {
          orderIndex: idx,
        }).catch(() => {
          // If doc doesn't exist, create it
          return setDoc(doc(db, 'watchlists', docId), {
            uid,
            symbol,
            orderIndex: idx,
            createdAt: new Date().toISOString(),
          });
        });
      });
      await Promise.all(promises);
    } catch (err) {
      console.warn('Firebase update watchlist order error:', err);
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  // 3. Community Posts & Comments
  async getPosts(): Promise<CommunityPost[]> {
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      const list: CommunityPost[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          author: {
            id: d.authorId,
            name: d.authorName || '투자자',
            avatar: d.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
            badge: d.authorBadge || '정회원',
            tier: d.authorTier || '골드',
          },
          category: d.category || 'free',
          title: d.title,
          content: d.content,
          symbol: d.stockSymbol,
          symbolName: d.stockName || d.stockSymbolName,
          likes: d.likeCount || 0,
          likedBy: d.likedBy || [],
          views: d.viewCount || 0,
          commentsCount: d.commentCount || (d.comments ? d.comments.length : 0),
          createdAt: d.createdAt ? (d.createdAt.length < 20 ? d.createdAt : new Date(d.createdAt).toLocaleDateString('ko-KR')) : '방금 전',
          updatedAt: d.updatedAt,
          tags: d.tags || [],
          isHot: (d.likeCount || 0) >= 10,
          comments: d.comments || [],
        });
      });
      return list;
    } catch (err) {
      console.warn('Firebase get posts failed:', err);
      return [];
    }
  },

  subscribePosts(callback: (posts: CommunityPost[]) => void): () => void {
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
      return onSnapshot(q, snap => {
        const list: CommunityPost[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            author: {
              id: d.authorId,
              name: d.authorName || '투자자',
              avatar: d.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
              badge: d.authorBadge || '정회원',
              tier: d.authorTier || '골드',
            },
            category: d.category || 'free',
            title: d.title,
            content: d.content,
            symbol: d.stockSymbol,
            symbolName: d.stockName || d.stockSymbolName,
            likes: d.likeCount || 0,
            likedBy: d.likedBy || [],
            views: d.viewCount || 0,
            commentsCount: d.commentCount || (d.comments ? d.comments.length : 0),
            createdAt: d.createdAt ? (d.createdAt.length < 20 ? d.createdAt : new Date(d.createdAt).toLocaleDateString('ko-KR')) : '방금 전',
            updatedAt: d.updatedAt,
            tags: d.tags || [],
            isHot: (d.likeCount || 0) >= 10,
            comments: d.comments || [],
          });
        });
        callback(list);
      }, err => {
        console.warn('subscribePosts error:', err);
      });
    } catch (err) {
      console.warn('subscribePosts exception:', err);
      return () => {};
    }
  },

  async getPostById(postId: string): Promise<CommunityPost | undefined> {
    try {
      const snap = await getDoc(doc(db, 'posts', postId));
      if (!snap.exists()) return undefined;
      const d = snap.data();
      return {
        id: snap.id,
        author: {
          id: d.authorId,
          name: d.authorName || '투자자',
          avatar: d.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
          badge: d.authorBadge || '정회원',
          tier: d.authorTier || '골드',
        },
        category: d.category || 'free',
        title: d.title,
        content: d.content,
        symbol: d.stockSymbol,
        symbolName: d.stockName || d.stockSymbolName,
        likes: d.likeCount || 0,
        likedBy: d.likedBy || [],
        views: d.viewCount || 0,
        commentsCount: d.commentCount || (d.comments ? d.comments.length : 0),
        createdAt: d.createdAt ? (d.createdAt.length < 20 ? d.createdAt : new Date(d.createdAt).toLocaleDateString('ko-KR')) : '방금 전',
        updatedAt: d.updatedAt,
        tags: d.tags || [],
        isHot: (d.likeCount || 0) >= 10,
        comments: d.comments || [],
      };
    } catch (err) {
      console.warn('Firebase getPostById failed:', err);
      return undefined;
    }
  },

  async createPost(post: Omit<CommunityPost, 'id' | 'likes' | 'views' | 'commentsCount' | 'createdAt'>): Promise<string> {
    try {
      const col = collection(db, 'posts');
      const docRef = doc(col);
      await setDoc(docRef, {
        id: docRef.id,
        authorId: post.author.id,
        authorName: post.author.name,
        authorAvatar: post.author.avatar,
        authorBadge: post.author.badge,
        authorTier: post.author.tier,
        category: post.category,
        title: post.title,
        content: post.content,
        stockSymbol: post.symbol || '',
        stockName: post.symbolName || '',
        viewCount: 1,
        likeCount: 0,
        likedBy: [],
        commentCount: 0,
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'published',
        tags: post.tags || [],
      });
      return docRef.id;
    } catch (err) {
      console.warn('Firebase create post failed:', err);
      return `local-${Date.now()}`;
    }
  },

  async updatePost(postId: string, updates: Partial<CommunityPost>): Promise<void> {
    try {
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.category !== undefined) updateData.category = updates.category;
      if (updates.symbol !== undefined) updateData.stockSymbol = updates.symbol;
      if (updates.symbolName !== undefined) updateData.stockName = updates.symbolName;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      await updateDoc(doc(db, 'posts', postId), updateData);
    } catch (err) {
      console.warn('Firebase update post failed:', err);
    }
  },

  async deletePost(postId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err) {
      console.warn('Firebase delete post failed:', err);
    }
  },

  async incrementPostView(postId: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId);
      const snap = await getDoc(postRef);
      if (snap.exists()) {
        const curViews = snap.data().viewCount || 0;
        await updateDoc(postRef, { viewCount: curViews + 1 });
      }
    } catch (err) {
      console.warn('Firebase incrementPostView failed:', err);
    }
  },

  async togglePostLike(postId: string, userId: string): Promise<{ likes: number; likedBy: string[] } | null> {
    try {
      const postRef = doc(db, 'posts', postId);
      const snap = await getDoc(postRef);
      if (!snap.exists()) return null;

      const d = snap.data();
      let likedBy: string[] = d.likedBy || [];
      let likeCount: number = d.likeCount || 0;

      if (likedBy.includes(userId)) {
        likedBy = likedBy.filter(id => id !== userId);
        likeCount = Math.max(0, likeCount - 1);
      } else {
        likedBy.push(userId);
        likeCount += 1;
      }

      await updateDoc(postRef, {
        likedBy,
        likeCount,
      });

      return { likes: likeCount, likedBy };
    } catch (err) {
      console.warn('Firebase togglePostLike failed:', err);
      return null;
    }
  },

  async addComment(postId: string, comment: CommentItem): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId);
      const snap = await getDoc(postRef);
      if (snap.exists()) {
        const curComments: CommentItem[] = snap.data().comments || [];
        curComments.push(comment);
        await updateDoc(postRef, {
          comments: curComments,
          commentCount: curComments.length,
        });
      }
    } catch (err) {
      console.warn('Firebase addComment failed:', err);
    }
  },

  async updateComment(postId: string, commentId: string, newContent: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId);
      const snap = await getDoc(postRef);
      if (snap.exists()) {
        const curComments: CommentItem[] = snap.data().comments || [];
        const target = curComments.find(c => c.id === commentId);
        if (target) {
          target.content = newContent;
          target.updatedAt = new Date().toISOString();
          await updateDoc(postRef, { comments: curComments });
        }
      }
    } catch (err) {
      console.warn('Firebase updateComment failed:', err);
    }
  },

  async deleteComment(postId: string, commentId: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId);
      const snap = await getDoc(postRef);
      if (snap.exists()) {
        const curComments: CommentItem[] = snap.data().comments || [];
        const filtered = curComments.filter(c => c.id !== commentId);
        await updateDoc(postRef, {
          comments: filtered,
          commentCount: filtered.length,
        });
      }
    } catch (err) {
      console.warn('Firebase deleteComment failed:', err);
    }
  },

  async createReport(report: Omit<ReportItem, 'id' | 'createdAt' | 'status'>): Promise<string> {
    try {
      const col = collection(db, 'reports');
      const docRef = doc(col);
      await setDoc(docRef, {
        id: docRef.id,
        reporterId: report.reporterId,
        reporterName: report.reporterName,
        targetType: report.targetType,
        targetId: report.targetId,
        postId: report.postId || '',
        targetContent: report.targetContent,
        targetAuthorName: report.targetAuthorName,
        reason: report.reason,
        createdAt: new Date().toISOString(),
        status: 'pending',
      });
      return docRef.id;
    } catch (err) {
      console.warn('Firebase createReport failed:', err);
      return `rep-${Date.now()}`;
    }
  },

  // 4. Chat Rooms & Messages Real-time Subscription
  async getChatRooms(): Promise<ChatRoomInfo[]> {
    try {
      const snap = await getDocs(collection(db, 'chatRooms'));
      const rooms: ChatRoomInfo[] = [];
      snap.forEach(d => {
        const data = d.data();
        rooms.push({
          id: d.id,
          name: data.name,
          desc: data.desc,
          icon: data.icon || '💬',
          count: data.count || 0,
          category: data.category,
          creatorId: data.creatorId,
          creatorName: data.creatorName,
          symbol: data.symbol,
          createdAt: data.createdAt,
        });
      });
      return rooms;
    } catch (err) {
      console.warn('Firebase getChatRooms error:', err);
      return [];
    }
  },

  subscribeChatRooms(callback: (rooms: ChatRoomInfo[]) => void): () => void {
    try {
      const q = query(collection(db, 'chatRooms'), limit(50));
      return onSnapshot(q, snap => {
        const rooms: ChatRoomInfo[] = [];
        snap.forEach(d => {
          const data = d.data();
          rooms.push({
            id: d.id,
            name: data.name,
            desc: data.desc,
            icon: data.icon || '💬',
            count: data.count || 0,
            category: data.category,
            creatorId: data.creatorId,
            creatorName: data.creatorName,
            symbol: data.symbol,
            createdAt: data.createdAt,
          });
        });
        callback(rooms);
      }, err => {
        console.warn('subscribeChatRooms snapshot error:', err);
      });
    } catch (err) {
      return () => {};
    }
  },

  async createChatRoom(room: Omit<ChatRoomInfo, 'id'>): Promise<string> {
    try {
      const docRef = doc(collection(db, 'chatRooms'));
      await setDoc(docRef, {
        ...room,
        id: docRef.id,
        createdAt: new Date().toISOString(),
      });
      return docRef.id;
    } catch (err) {
      console.warn('Firebase createChatRoom error:', err);
      return `custom-${Date.now()}`;
    }
  },

  subscribeChat(roomId: string, callback: (messages: ChatMessage[]) => void): () => void {
    try {
      const q = query(
        collection(db, 'chatMessages'),
        where('roomId', '==', roomId),
        limit(100)
      );
      return onSnapshot(q, snap => {
        const list: ChatMessage[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          const time = d.createdAt ? new Date(d.createdAt).toTimeString().split(' ')[0] : '12:00:00';
          list.push({
            id: docSnap.id,
            roomId: d.roomId,
            author: {
              id: d.authorId,
              name: d.authorName || '투자자',
              avatar: d.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
              role: d.authorRole,
            },
            message: d.content,
            timestamp: time,
            sentiment: d.sentiment,
            likes: 0,
          });
        });
        // Sort chronologically ascending in JS memory
        list.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
        callback(list);
      }, err => {
        console.warn('Firestore onSnapshot error:', err);
      });
    } catch (err) {
      console.warn('subscribeChat exception:', err);
      return () => {};
    }
  },

  async sendChatMessage(msg: Omit<ChatMessage, 'id' | 'timestamp' | 'likes'>): Promise<string> {
    try {
      const col = collection(db, 'chatMessages');
      const docRef = doc(col);
      await setDoc(docRef, {
        id: docRef.id,
        roomId: msg.roomId,
        authorId: msg.author.id,
        authorName: msg.author.name,
        authorAvatar: msg.author.avatar,
        authorRole: msg.author.role || '회원',
        content: msg.message,
        sentiment: msg.sentiment || 'neutral',
        createdAt: new Date().toISOString(),
        status: 'active',
      });
      return docRef.id;
    } catch (err) {
      console.warn('Firebase send chat failed:', err);
      return `local-${Date.now()}`;
    }
  },

  async deleteChatMessage(messageId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'chatMessages', messageId));
    } catch (err) {
      console.warn('Firebase delete chat message failed:', err);
    }
  },

  async restrictChatUser(uid: string, reason: string, adminUid: string): Promise<void> {
    try {
      const docRef = doc(db, 'chatRestrictions', uid);
      await setDoc(docRef, {
        uid,
        reason,
        restrictedBy: adminUid,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Firebase restrict chat user failed:', err);
    }
  },

  async unrestrictChatUser(uid: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'chatRestrictions', uid));
    } catch (err) {
      console.warn('Firebase unrestrict chat user failed:', err);
    }
  },

  async isUserChatRestricted(uid: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, 'chatRestrictions', uid));
      return snap.exists();
    } catch (err) {
      console.warn('Firebase isUserChatRestricted check failed:', err);
      return false;
    }
  },

  subscribeChatRestrictions(callback: (restrictedUids: string[]) => void): () => void {
    try {
      const col = collection(db, 'chatRestrictions');
      return onSnapshot(col, snap => {
        const uids: string[] = [];
        snap.forEach(d => uids.push(d.id));
        callback(uids);
      }, err => {
        console.warn('subscribeChatRestrictions error:', err);
      });
    } catch (err) {
      console.warn('subscribeChatRestrictions exception:', err);
      return () => {};
    }
  },

  // 5. Alerts
  async getUserAlerts(uid: string): Promise<PriceAlert[]> {
    try {
      const q = query(collection(db, 'alerts'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const list: PriceAlert[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          symbol: d.symbol,
          symbolName: d.symbolName || d.symbol,
          targetPrice: d.value,
          condition: d.condition,
          createdAt: d.createdAt ? new Date(d.createdAt).toLocaleDateString('ko-KR') : '2026.10.01',
          isTriggered: false,
          note: d.note,
        });
      });
      return list;
    } catch (err) {
      console.warn('Firebase get alerts failed:', err);
      return [];
    }
  },

  async createAlert(uid: string, alert: Omit<PriceAlert, 'id' | 'createdAt' | 'isTriggered'>): Promise<void> {
    try {
      const docRef = doc(collection(db, 'alerts'));
      await setDoc(docRef, {
        id: docRef.id,
        uid,
        symbol: alert.symbol,
        symbolName: alert.symbolName,
        type: 'price',
        condition: alert.condition,
        value: alert.targetPrice,
        enabled: true,
        note: alert.note || '',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Firebase create alert failed:', err);
    }
  },

  async deleteAlert(alertId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'alerts', alertId));
    } catch (err) {
      console.warn('Firebase delete alert failed:', err);
    }
  },
};
