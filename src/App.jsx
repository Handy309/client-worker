import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'https://keenly-quit-purr.ngrok-free.dev';

function App() {
  const [workerId, setWorkerId] = useState('');
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [imageBlobUrl, setImageBlobUrl] = useState(''); // State لتخزين رابط الصورة المؤقت

  // Store worker ID locally and register to backend
  useEffect(() => {
    const initWorker = async () => {
      let savedWorkerId = localStorage.getItem('cluster_worker_id');
      
      if (!savedWorkerId) {
        savedWorkerId = 'worker_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('cluster_worker_id', savedWorkerId);
      }
      
      setWorkerId(savedWorkerId);

      try {
        await fetch(`${API_BASE_URL}/api/workers/register`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ workerId: savedWorkerId }),
        });
      } catch (error) {
        console.error('Error registering worker:', error);
      }
    };

    initWorker();
  }, []);

  // Send heartbeat every 2 seconds
  useEffect(() => {
    if (!workerId) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        await fetch(`${API_BASE_URL}/api/workers/heartbeat`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ workerId }),
        });
      } catch (error) {
        console.error('Error sending heartbeat:', error);
      }
    }, 2000);

    return () => clearInterval(heartbeatInterval);
  }, [workerId]);

  // Fetch tasks assigned to this worker
  useEffect(() => {
    if (!workerId) return;

    const fetchTasks = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/tasks/worker/${workerId}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await response.json();
        
        if (data.success && data.data.length > 0) {
          setAssignedTasks((prevTasks) => {
            return data.data.map((newTask) => {
              const existingTask = prevTasks.find(
                (t) => (t.subTaskId || t._id) === (newTask.subTaskId || newTask._id)
              );
              return {
                ...newTask,
                grayscaleValue: existingTask ? existingTask.grayscaleValue : (newTask.grayscaleValue ?? 0)
              };
            });
          });
        } else {
          setAssignedTasks([]);
          setCurrentTaskIndex(0);
        }
      } catch (error) {
        console.error('Error fetching tasks automatically:', error);
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);

    return () => clearInterval(interval);
  }, [workerId]);

  const handleSliderChange = (e) => {
    const value = Number(e.target.value);
    setAssignedTasks(prevTasks => {
      const updated = [...prevTasks];
      if (updated[currentTaskIndex]) {
        updated[currentTaskIndex] = {
          ...updated[currentTaskIndex],
          grayscaleValue: value
        };
      }
      return updated;
    });
  };

  const handleSubmitResult = async () => {
    if (assignedTasks.length === 0) return;
    
    const currentTask = assignedTasks[currentTaskIndex];
    const targetSubTaskId = currentTask.taskId || currentTask.subTaskId || currentTask._id;
    
    setIsProcessing(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks/submit`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          workerId: workerId,
          taskId: targetSubTaskId,
          grayscaleValue: currentTask.grayscaleValue ?? 0,
          status: 'Completed'
        }),
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        setAssignedTasks(prevTasks => {
          const remaining = prevTasks.filter((_, idx) => idx !== currentTaskIndex);
          return remaining;
        });
        
        setCurrentTaskIndex(0);
        alert(`Chunk "${currentTask.name}" submitted successfully!`);
      } else {
        alert(`Error submitting: ${resData.error || resData.message}`);
      }
    } catch (err) {
      console.error('Error submitting task:', err);
      alert('Network error while submitting task.');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.overflow = 'hidden';
  }, []);

  const activeTask = assignedTasks[currentTaskIndex];
  
  const imageUrl = activeTask 
    ? (activeTask.path 
        ? (activeTask.path.startsWith('http') 
            ? activeTask.path 
            : `${API_BASE_URL}/${activeTask.path.replace(/\\/g, '/').replace(/^\/+/, '')}`)
        : `${API_BASE_URL}/uploads/${activeTask.filename || activeTask.fileName}`)
    : '';

  // جلب الصورة كـ Blob وتجاوز صفحة تحذير ngrok
  useEffect(() => {
    if (!imageUrl) {
      setImageBlobUrl('');
      return;
    }

    let isMounted = true;

    fetch(imageUrl, {
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch chunk image');
        return res.blob();
      })
      .then((blob) => {
        if (isMounted) {
          const objectUrl = URL.createObjectURL(blob);
          setImageBlobUrl(objectUrl);
        }
      })
      .catch((err) => console.error('Error loading chunk image blob:', err));

    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  const currentGrayscale = activeTask ? (activeTask.grayscaleValue ?? 0) : 0;

  return (
    <div style={{ 
      position: 'fixed',
      top: 0, left: 0,
      width: '100vw', height: '100vh',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: 'radial-gradient(circle at center, #27272a 0%, #09090b 100%)',
      fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
      overflow: 'hidden'
    }}>
      
      {assignedTasks.length > 0 && (
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(39, 39, 42, 0.8)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            padding: '10px 14px',
            borderRadius: '10px',
            cursor: 'pointer',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            fontSize: '13px',
            backdropFilter: 'blur(10px)'
          }}
        >
          <span>☰</span> Tasks Queue ({assignedTasks.length})
        </button>
      )}

      <div style={{
        position: 'absolute',
        top: 0,
        left: sidebarOpen ? 0 : '-320px',
        width: '300px',
        height: '100vh',
        background: 'rgba(18, 18, 20, 0.95)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        transition: 'left 0.3s ease-in-out',
        zIndex: 99,
        padding: '80px 20px 20px 20px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflowY: 'auto'
      }}>
        <h3 style={{ color: '#f4f4f5', fontSize: '15px', margin: '0 0 10px 0' }}>Assigned Segments</h3>
        {assignedTasks.map((task, index) => (
          <div 
            key={task.subTaskId || task._id || index}
            onClick={() => {
              setCurrentTaskIndex(index);
              setSidebarOpen(false);
            }}
            style={{
              padding: '12px',
              borderRadius: '10px',
              background: currentTaskIndex === index ? 'rgba(14, 165, 233, 0.2)' : 'rgba(39, 39, 42, 0.4)',
              border: currentTaskIndex === index ? '1px solid #0ea5e9' : '1px solid rgba(255, 255, 255, 0.05)',
              cursor: 'pointer',
              color: '#fff',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600', color: currentTaskIndex === index ? '#38bdf8' : '#f4f4f5' }}>
                {task.name}
              </p>
              <span style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                {task.grayscaleValue ?? 0}%
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#a1a1aa' }}>
              File: {task.filename}
            </p>
          </div>
        ))}
      </div>

      <div style={{
        background: 'linear-gradient(145deg, rgba(24, 24, 27, 0.9), rgba(9, 9, 11, 0.95))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '28px',
        padding: '30px 25px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        maxWidth: '460px',
        width: '90%',
        textAlign: 'center',
        color: '#ffffff',
        backdropFilter: 'blur(20px)'
      }}>
        
        <div style={{ marginBottom: '20px' }}>
          <span style={{ 
            background: 'rgba(14, 165, 233, 0.15)', 
            color: '#38bdf8', 
            padding: '4px 12px', 
            borderRadius: '20px', 
            fontSize: '12px',
            fontWeight: '600',
            border: '1px solid rgba(56, 189, 248, 0.3)'
          }}>
            Worker Node Active {assignedTasks.length > 0 ? `(${assignedTasks.length} Tasks)` : ''}
          </span>
          <h1 style={{ margin: '12px 0 6px 0', fontSize: '20px', fontWeight: '700', color: '#f4f4f5' }}>
            Cluster Processing Node
          </h1>
          <p style={{ margin: 0, color: '#a1a1aa', fontSize: '12px' }}>
            ID: <code style={{ color: '#38bdf8' }}>{workerId || 'Connecting...'}</code>
          </p>
        </div>

        {assignedTasks.length === 0 ? (
          <div style={{ 
            border: '2px dashed rgba(82, 82, 91, 0.4)', 
            padding: '40px 20px', 
            borderRadius: '16px', 
            background: 'rgba(39, 39, 42, 0.3)',
            color: '#a1a1aa'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '500' }}>No tasks found or all completed.</p>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'left', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: '600' }}>Segment: {activeTask?.name}</span>
                <p style={{ fontSize: '11px', color: '#a1a1aa', margin: '2px 0 0 0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  File: {activeTask?.filename}
                </p>
              </div>
              <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px' }}>
                {currentTaskIndex + 1} of {assignedTasks.length}
              </span>
            </div>

            <div style={{ 
              height: '160px', 
              background: '#000',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <img 
                src={imageBlobUrl || imageUrl} 
                alt="Chunk Segment" 
                crossOrigin="anonymous"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: `grayscale(${currentGrayscale}%)`,
                  transition: 'filter 0.1s ease-out'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa', marginBottom: '6px' }}>
                <span>Grayscale Processing</span>
                <span>{currentGrayscale}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={currentGrayscale} 
                onChange={handleSliderChange}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#0ea5e9' }}
              />
            </div>

            <button 
              onClick={handleSubmitResult}
              disabled={isProcessing}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.4)'
              }}
            >
              {isProcessing ? 'Sending Result...' : 'Submit Processed Chunk'}
            </button>
          </div>
        )}

      </div>

    </div>
  );
}

export default App;