
// Cache buster: ${new Date().toISOString()}
// Minor comment to help ensure this version is picked up after cache clearing. Date: ${new Date().toISOString()}
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { MainArea } from './components/MainArea.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { RegistrationPage } from './components/RegistrationPage.tsx';
import { UserProfilePanel } from './components/UserProfilePanel.tsx'; 
import { VideoCallModal } from './components/VideoCallModal.tsx'; // New
import type { Chat, User, Message, MessageType, UserVisibility, CallDetails, CallStatus, SignalingMessage } from './types';
import { AppView } from './types';
import { useTheme } from './contexts/ThemeContext.tsx';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext.tsx'; // Verified relative path
import { MenuIcon, CloseIcon, AppLogoIcon } from './components/icons/EditorIcons.tsx';
import * as Storage from './localStorageService.ts';
import * as WebRTC from './services/webrtcService.ts'; // New
import { subscribe, publish } from './utils/eventBus.ts'; // New

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);
  const [activeSubView, setActiveSubView] = useState<{ view: AppView | null, data?: any }>({ view: null });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<{ [key: string]: Message[] }>({});
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { theme } = useTheme();
  const { t, setLanguage, dir } = useLanguage();
  const [friendRequestCount, setFriendRequestCount] = useState(0);

  // Video Call State
  const [callDetails, setCallDetails] = useState<CallDetails | null>(null);
  const [callPartner, setCallPartner] = useState<User | null>(null);


  useEffect(() => {
    Storage.initializeDB(); // Ensure DB is initialized
    const userId = Storage.getCurrentUserId();
    if (userId) {
      const user = Storage.findUserById(userId);
      if (user) {
        handleLoginSuccess(user);
      } else {
        Storage.setCurrentUserId(null);
        setCurrentView(AppView.LOGIN);
      }
    } else {
      setCurrentView(AppView.LOGIN);
    }
  }, []); // Empty dependency array means this runs once on mount

  const loadUserData = useCallback(() => {
    if (!currentUser) return;
    const userChats = Storage.getChats()
      .filter(chat => chat.participants.includes(currentUser.id))
      .filter(chat => { 
          if (chat.type === 'individual') {
              const partnerId = chat.participants.find(pId => pId !== currentUser.id);
              if (!partnerId) return false; 
              const partner = Storage.findUserById(partnerId);
              if (currentUser.blockedUserIds?.includes(partnerId) || partner?.blockedUserIds?.includes(currentUser.id)) {
                  return false;
              }
          }
          // Filter out chats marked as deleted by the current user
          if (chat.deletedFor && chat.deletedFor[currentUser.id]) {
            return false;
          }
          return true; 
      })
      .map(chat => {
        let chatName = chat.name;
        let chatAvatarUrl = chat.avatarUrl;
        let participantDetails = chat.participantDetails || {};

        if (chat.type === 'individual') {
          const partnerId = chat.participants.find(pId => pId !== currentUser.id);
          const partner = partnerId ? Storage.findUserById(partnerId) : null;
          chatName = partner?.nickname || partner?.name || chat.name;
          chatAvatarUrl = partner?.avatarUrl || chat.avatarUrl;
          if (partner) { 
            participantDetails[partner.id] = {
                name: partner.name,
                nickname: partner.nickname,
                avatarUrl: partner.avatarUrl,
                status: partner.status,
                lastSeen: partner.lastSeen,
                visibilitySettings: partner.visibilitySettings
            };
          }
        } else if (chat.type === 'group') { 
            chat.participants.forEach(pId => {
                const pUser = Storage.findUserById(pId);
                if (pUser) {
                     participantDetails[pId] = {
                        name: pUser.name,
                        nickname: pUser.nickname,
                        avatarUrl: pUser.avatarUrl,
                        status: pUser.status,
                        lastSeen: pUser.lastSeen,
                        visibilitySettings: pUser.visibilitySettings
                    };
                }
            });
        }
        return {
          ...chat,
          name: chatName,
          avatarUrl: chatAvatarUrl,
          participantDetails: participantDetails, 
          unreadCount: chat.unreadCounts?.[currentUser.id] || 0,
        };
      })
      .sort((a,b) => new Date(b.lastMessageTimestamp || 0).getTime() - new Date(a.lastMessageTimestamp || 0).getTime());
    setChats(userChats);
    setMessages(Storage.getMessages());
    setLanguage(currentUser.language || 'en');
    setFriendRequestCount(currentUser.friendRequestsReceived?.length || 0);
  }, [currentUser, setLanguage]);

  // WebRTC Initialization and Signaling Subscription
  useEffect(() => {
    if (!currentUser) return;

    WebRTC.init(
        (remoteStream) => { // onRemoteStream
            setCallDetails(prev => prev ? ({ ...prev, remoteStream, status: 'connected' }) : null);
        },
        (endedCallId, duration) => { // onCallEnded
            setCallDetails(prev => {
                if (prev && prev.callId === endedCallId) {
                    if (duration !== undefined && prev.chatId) {
                         Storage.addMessage(prev.chatId, {
                            chatId: prev.chatId, 
                            senderId: 'system', 
                            content: t('video_call_ended_log', {duration: `${Math.floor(duration / 60)}m ${duration % 60}s`}),
                            timestamp: new Date().toISOString(),
                            type: 'video_call_log',
                            callDuration: duration,
                        });
                        loadUserData(); 
                    }
                    return null; 
                }
                return prev;
            });
            setCallPartner(null);
        },
        (error) => { // onCallError
            console.error("WebRTC Error:", error);
            alert(`Call error: ${error}`); 
            setCallDetails(prev => prev ? ({ ...prev, status: 'error' }) : null);
        }
    );
    
    const unsubscribeSignaling = subscribe(`signaling-${currentUser.id}`, (message: SignalingMessage) => {
        if (message.type === 'offer' && message.payload.chatId) {
            const partner = Storage.findUserById(message.senderId);
            setCallPartner(partner || null);
            setCallDetails({
                callId: message.callId,
                chatId: message.payload.chatId, 
                callerId: message.senderId,
                calleeId: currentUser.id,
                isOutgoing: false,
                status: 'ringing_incoming',
                offer: message.payload, 
            });
        } else {
            WebRTC.handleSignalingMessage(message);
        }
    });

    return () => {
      unsubscribeSignaling();
      if (callDetails) WebRTC.cleanupCall(); 
    };
  }, [currentUser, loadUserData, callDetails, t]);


  useEffect(() => {
    if (currentUser && currentView === AppView.CHAT) {
      loadUserData();
    }
  }, [currentUser, currentView, loadUserData]);

  useEffect(() => {
    document.documentElement.className = theme;
    document.body.className = `bg-background-page-light dark:bg-background-page-dark text-text-light dark:text-text-dark transition-colors duration-300`;
    document.documentElement.dir = dir;
  }, [theme, dir]);

  useEffect(() => {
    let title = t('app_title'); // Default
    if (currentView === AppView.LOGIN) {
        title = `${t('login_title')} - ${t('app_title')}`;
    } else if (currentView === AppView.REGISTER) {
        title = `${t('registration_title')} - ${t('app_title')}`;
    } else if (currentView === AppView.CHAT) {
        if (activeSubView.view === AppView.USER_PROFILE && activeSubView.data) {
            const profileUser = activeSubView.data as User;
            title = `${profileUser.nickname || profileUser.name} - ${t('app_title')}`;
        } else if (activeSubView.view === AppView.SETTINGS) {
             title = `${t('settings_panel_title')} - ${t('app_title')}`;
        } else if (activeSubView.view === AppView.SHARED_MEDIA && selectedChat) {
             title = `${t('shared_media_panel_title_with_chat', {chatName: selectedChat.name})} - ${t('app_title')}`;
        } else if (selectedChat) {
            title = `${selectedChat.name} - ${t('app_title')}`;
        }
        // Consider adding titles for sidebar states like "Find People", "Friend Requests" if needed
    }
    document.title = title;
  }, [currentView, selectedChat, activeSubView, t]);

  const handleLoginSuccess = (loggedInUser: User) => {
    setCurrentUser(loggedInUser);
    Storage.setCurrentUserId(loggedInUser.id);
    setLanguage(loggedInUser.language || 'en');
    setCurrentView(AppView.CHAT);
    setActiveSubView({ view: null });
  };

  const handleLogout = () => {
    if (callDetails) WebRTC.endCall(callDetails.callId, callDetails.isOutgoing ? callDetails.calleeId : callDetails.callerId);
    setCallDetails(null);
    setCallPartner(null);
    const userId = currentUser?.id;
    if (userId) Storage.updateUser(userId, {status: 'offline'}); // Set status to offline
    setCurrentUser(null);
    Storage.setCurrentUserId(null);
    setChats([]);
    setMessages({});
    setSelectedChat(null);
    setLanguage('en');
    setCurrentView(AppView.LOGIN);
    setActiveSubView({ view: null });
  };

  const handleUserUpdate = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    if (updatedUser.language && updatedUser.language !== (currentUser?.language || 'en')) {
        setLanguage(updatedUser.language);
    }
    setFriendRequestCount(updatedUser.friendRequestsReceived?.length || 0);
    loadUserData(); 
  };
  
  const handleChangeAppView = (view: AppView, data?: any) => {
    if (view === AppView.USER_PROFILE && data?.user) {
        setActiveSubView({ view: AppView.USER_PROFILE, data: data.user });
    } else if (view === AppView.SETTINGS){
        // Settings are typically handled within the sidebar, not as a main subview that replaces chat.
        // If settings were to replace the chat area, this would be:
        // setActiveSubView({ view: AppView.SETTINGS });
        // For now, let's assume settings is a sidebar panel and doesn't change main content view from chat.
        // If settings panel is its own "activeSubView" that overlays or replaces MainArea, that's different.
        // The current structure has SettingsPanel inside Sidebar.
        // This function is mostly for overlays or full view changes.
        console.log("handleChangeAppView called with SETTINGS, usually handled by Sidebar's activeTopNav");
    } else if (view === AppView.LOGIN || view === AppView.REGISTER || view === AppView.CHAT) {
        setCurrentView(view);
        setActiveSubView({ view: null }); 
    } else {
        // For other views like SHARED_MEDIA, directly set it as activeSubView
        // This assumes AppView.CHAT is the main background view
        setActiveSubView({ view: view, data: data });
    }
  };


  const handleRegistrationSuccess = () => {
    setCurrentView(AppView.LOGIN);
    setActiveSubView({ view: null });
  };

  const handleSelectChat = (chatToSelect: Chat) => {
    if (!currentUser) return;
    Storage.markAllMessagesInChatAsRead(chatToSelect.id, currentUser.id);
    const updatedChat = { ...chatToSelect, unreadCounts: { ...(chatToSelect.unreadCounts || {}), [currentUser.id]: 0 }};
    setSelectedChat(updatedChat);
    setChats(prevChats => prevChats.map(c => 
        c.id === updatedChat.id ? { ...c, ...updatedChat, unreadCount: 0 } : c
    ));
    setIsMobileSidebarOpen(false);
    setActiveSubView({ view: null }); 
  };

  const handleDeselectChat = () => {
    setSelectedChat(null);
    setActiveSubView({ view: null }); 
  };

  const handleSendMessage = (chatId: string, messagePayload: { content: string; type: MessageType; fileName?: string; fileUrl?: string }) => {
    if (!currentUser) return;
    const newMessageData: Omit<Message, 'id' | 'readBy' | 'isSent'> = {
      chatId: chatId,
      senderId: currentUser.id,
      content: messagePayload.content,
      timestamp: new Date().toISOString(),
      type: messagePayload.type,
      fileName: messagePayload.fileName,
      fileUrl: messagePayload.fileUrl,
    };
    const newMessage = Storage.addMessage(chatId, newMessageData);
    setMessages(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), newMessage],
    }));
    loadUserData(); 
    setTimeout(() => {
      const chatView = document.querySelector('.chat-view-area');
      if (chatView) chatView.scrollTop = chatView.scrollHeight;
    }, 100);
  };

  const handleStartNewChat = (targetUser: User) => {
    if (!currentUser) return;
    const newChat = Storage.createOrGetIndividualChat(currentUser.id, targetUser.id);
    if (newChat) {
      loadUserData();
      const partner = Storage.findUserById(targetUser.id);
      const displayChat = {
        ...newChat,
        name: partner?.nickname || partner?.name || newChat.name,
        avatarUrl: partner?.avatarUrl || newChat.avatarUrl,
        unreadCount: newChat.unreadCounts?.[currentUser.id] || 0,
      };
      setSelectedChat(displayChat);
      setIsMobileSidebarOpen(false);
      setActiveSubView({ view: null });
    }
  };

  const handleCreateGroupChat = (groupName: string, participantIds: string[], groupAvatarUrl?: string) => {
    if(!currentUser) return;
    const newGroupChat = Storage.createGroupChat(currentUser.id, participantIds, groupName, groupAvatarUrl);
    if (newGroupChat) {
        loadUserData();
        const displayGroupChat = {
            ...newGroupChat,
            unreadCount: newGroupChat.unreadCounts?.[currentUser.id] || 0,
        }
        setSelectedChat(displayGroupChat);
        setIsMobileSidebarOpen(false);
        setActiveSubView({ view: null });
    }
  };
  
  const handleChatUpdate = (updatedChat: Chat) => {
    setChats(prevChats => prevChats.map(c => c.id === updatedChat.id ? {...c, ...updatedChat, unreadCount: updatedChat.unreadCounts?.[currentUser!.id] || 0 } : c));
    if (selectedChat && selectedChat.id === updatedChat.id) {
        setSelectedChat({...selectedChat, ...updatedChat });
    }
    loadUserData(); 
  };

  // Video Call Handlers
  const handleStartVideoCall = async (targetUserId: string, chatId: string) => {
    if (!currentUser || callDetails?.status === 'connected' || callDetails?.status === 'ringing_outgoing' || callDetails?.status === 'ringing_incoming') {
      alert(t('video_call_already_in_progress_or_ringing'));
      return;
    }
    const callId = `call_${currentUser.id}_${targetUserId}_${Date.now()}`;
    const partner = Storage.findUserById(targetUserId);
    setCallPartner(partner || null);

    setCallDetails({
        callId, chatId, callerId: currentUser.id, calleeId: targetUserId, 
        isOutgoing: true, status: 'initiating'
    });
    const localStream = await WebRTC.startCall(callId, targetUserId);
    if (localStream) {
        setCallDetails(prev => prev ? ({ ...prev, localStream, status: 'ringing_outgoing' }) : null);
    } else {
        setCallDetails(null); 
        setCallPartner(null);
    }
  };

  const handleAnswerVideoCall = async (callId: string, offer: RTCSessionDescriptionInit, callerId: string) => {
    if (!currentUser || callDetails?.status !== 'ringing_incoming') return;
    
    setCallDetails(prev => prev ? ({ ...prev, status: 'connecting' }) : null);
    const localStream = await WebRTC.answerCall(callId, offer, callerId);
    if (localStream) {
        setCallDetails(prev => prev ? ({ ...prev, localStream, status: 'connected' }) : null);
    } else {
        // Error handled by WebRTC.init's onError
    }
  };

  const handleEndVideoCall = (callId: string, targetUserId: string, reason: 'ended' | 'declined' = 'ended') => {
      WebRTC.endCall(callId, targetUserId, reason);
      if (reason === 'declined' && callDetails?.isOutgoing) {
          setCallDetails(null);
          setCallPartner(null);
          alert(t('video_call_user_declined', { user: callPartner?.nickname || targetUserId }));
      }
  };


  if (currentView === AppView.LOGIN) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} onSwitchView={handleChangeAppView} />;
  }

  if (currentView === AppView.REGISTER) {
    return <RegistrationPage onRegistrationSuccess={handleRegistrationSuccess} onSwitchView={handleChangeAppView} />;
  }

  if (!currentUser) {
     setCurrentView(AppView.LOGIN); // Should ideally not happen if logic above is correct
     return <LoginPage onLoginSuccess={handleLoginSuccess} onSwitchView={handleChangeAppView} />;
  }
  
  const mainContentArea = () => {
    if (activeSubView.view) {
        switch (activeSubView.view) {
            case AppView.USER_PROFILE:
                if (activeSubView.data) {
                    return <UserProfilePanel
                        user={activeSubView.data as User}
                        currentUser={currentUser}
                        onClose={() => setActiveSubView({ view: null })}
                        onUserUpdate={handleUserUpdate}
                        onChangeAppView={handleChangeAppView}
                        onStartChat={(targetUser) => {
                            const chatExists = chats.find(c => c.type === 'individual' && c.participants.includes(targetUser.id));
                            if(chatExists) handleSelectChat(chatExists);
                            else handleStartNewChat(targetUser);
                            setActiveSubView({ view: null }); // Close panel after starting chat
                        }}
                    />;
                }
                break;
            // Add case for SHARED_MEDIA if it's meant to overlay or replace MainArea
            // case AppView.SHARED_MEDIA:
            // return <SharedMediaPanel ... />;
        }
    }

    if (selectedChat) {
        return (
             <MainArea
              key={selectedChat.id}
              chat={selectedChat}
              chatId={selectedChat.id}
              currentUser={currentUser}
              messages={messages[selectedChat.id] || []}
              onSendMessage={handleSendMessage}
              onChatUpdate={handleChatUpdate}
              onUserUpdate={handleUserUpdate}
              onChangeAppView={handleChangeAppView}
              onDeselectChat={handleDeselectChat}
              onStartVideoCall={handleStartVideoCall} 
            />
        );
    }
    return (
        <div className={`flex-1 items-center justify-center text-text-secondary-light dark:text-text-secondary-dark ${isMobileSidebarOpen ? 'hidden md:flex' : 'flex'}`}>
            <div className="text-center p-4">
            <AppLogoIcon className="w-20 h-20 mx-auto mb-4 opacity-50 text-primary dark:text-primary" />
            <h2 className="text-xl font-light">{t('app_title')}</h2>
            <p className="mt-2 text-sm">{t('main_area_no_messages_placeholder_title')}</p>
            </div>
        </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
      <div className="md:hidden p-2 bg-background-sidebarNav-light dark:bg-background-sidebarNav-dark shadow-md flex items-center space-x-2 rtl:space-x-reverse border-b border-border-light dark:border-border-dark">
        <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="text-icon-light dark:text-icon-dark p-1.5 rounded hover:bg-background-hover-light dark:hover:bg-background-hover-dark"
            aria-label={isMobileSidebarOpen ? t('mobile_menu_close_label') : t('mobile_menu_open_label')}
            aria-expanded={isMobileSidebarOpen}
        >
          {isMobileSidebarOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
        </button>
        <span className="font-semibold text-lg text-text-light dark:text-text-dark truncate">
            {isMobileSidebarOpen ? t('app_title') : (selectedChat ? selectedChat.name : t('app_title'))}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`
          ${isMobileSidebarOpen ? 'block animate-slide-in-rtl md:animate-none' : 'hidden'} md:flex
          fixed md:static inset-0 z-30 md:z-auto
          h-full
          w-full md:w-[320px] lg:w-[360px] 
          flex-shrink-0
          transition-transform duration-300 ease-in-out
          ${dir === 'rtl' ? (isMobileSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0') : (isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')}
        `}>
          <Sidebar
            currentUser={currentUser}
            chats={chats}
            selectedChat={selectedChat}
            onSelectChat={handleSelectChat}
            onClose={() => setIsMobileSidebarOpen(false)}
            onStartNewChat={handleStartNewChat}
            onCreateGroupChat={handleCreateGroupChat}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
            friendRequestCount={friendRequestCount}
          />
        </div>

        <div className={`flex-1 flex flex-col bg-background-chat-light dark:bg-background-chat-dark overflow-hidden ${(isMobileSidebarOpen && !selectedChat) ? 'hidden md:flex' : 'flex'}`}>
           {mainContentArea()}
        </div>
        
        {/* Render UserProfilePanel if activeSubView matches */}
         {activeSubView.view === AppView.USER_PROFILE && activeSubView.data && (
            <UserProfilePanel
                user={activeSubView.data as User}
                currentUser={currentUser}
                onClose={() => setActiveSubView({ view: null })}
                onUserUpdate={handleUserUpdate}
                onChangeAppView={handleChangeAppView} // Pass this down
                onStartChat={(targetUser) => {
                    const chatExists = chats.find(c => c.type === 'individual' && c.participants.includes(targetUser.id));
                    if(chatExists) handleSelectChat(chatExists);
                    else handleStartNewChat(targetUser);
                    setActiveSubView({ view: null }); 
                }}
            />
        )}
      </div>
      {callDetails && callDetails.status !== 'idle' && callDetails.status !== 'ended' && callDetails.status !== 'error' && (
        <VideoCallModal
          callDetails={callDetails}
          currentUser={currentUser}
          partner={callPartner}
          onAnswerCall={handleAnswerVideoCall}
          onEndCall={handleEndVideoCall}
          onClose={() => handleEndVideoCall(callDetails.callId, callDetails.isOutgoing ? callDetails.calleeId : callDetails.callerId)}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [initialUser, setInitialUser] = useState<User | null>(null);
   useEffect(() => {
    // initializeDB is now called inside AppContent's useEffect to ensure modules are loaded
    const userId = Storage.getCurrentUserId();
    if (userId) {
      const user = Storage.findUserById(userId);
      if (user) setInitialUser(user);
    }
  }, []);

  return (
    <LanguageProvider currentUser={initialUser}>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;
