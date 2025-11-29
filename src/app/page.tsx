"use client";
import React, { useState } from "react";
import {
  Button,
  Input,
  Card,
  List,
  Avatar,
  Spin,
  Alert,
  Typography,
  Statistic,
  Row,
  Col,
  Divider,
} from "antd";
import { UserOutlined, LockOutlined, InstagramOutlined, ArrowLeftOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

interface InstagramUser {
  username: string;
  fullName: string;
  profilePic: string | null;
  profileLink: string | null;
}

interface Stats {
  followingCount: number;
  followersCount: number;
  notFollowingBackCount: number;
}

interface ApiResponse {
  following: InstagramUser[];
  followers: InstagramUser[];
  notFollowingBack: InstagramUser[];
  stats: Stats;
}

const Page = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!username || !password) {
      setError("กรุณากรอกทั้งชื่อผู้ใช้และรหัสผ่าน");
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch("/api/instagram/notfollowingback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "เกิดข้อผิดพลาดบางอย่าง");
      }

      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-4xl transition-all duration-500 ease-in-out">
        
        {!data && (
          <div className="flex justify-center items-center w-full h-full">
            <Card 
              className="shadow-2xl w-full max-w-md border-0 rounded-3xl overflow-hidden backdrop-blur-md bg-white/80"
              styles={{ body: { padding: '40px' } }}
            >
              <div className="flex flex-col gap-6">
                <div className="text-center mb-2">
                  <div className="bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
                    <InstagramOutlined style={{ fontSize: '32px', color: 'white' }} />
                  </div>
                  <Title level={3} className="!mb-0 !font-bold text-gray-800">ตรวจสอบคนไม่ฟอลกลับ</Title>
                  <Text className="text-gray-500">เช็คว่าใครไม่ได้ติดตามคุณกลับใน Instagram</Text>
                </div>

                {error && (
                  <Alert 
                    message={error} 
                    type="error" 
                    showIcon 
                    className="rounded-xl border-red-100 bg-red-50"
                  />
                )}
                
                <div className="space-y-4">
                  <div>
                    <Input
                      size="large"
                      placeholder="ชื่อผู้ใช้"
                      prefix={<UserOutlined className="text-gray-400" />}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="rounded-xl py-3 bg-gray-50 border-gray-200 hover:bg-white focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <Input.Password
                      size="large"
                      placeholder="รหัสผ่าน"
                      prefix={<LockOutlined className="text-gray-400" />}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl py-3 bg-gray-50 border-gray-200 hover:bg-white focus:bg-white transition-colors"
                    />
                  </div>

                  <Button
                    type="primary"
                    size="large"
                    onClick={handleCheck}
                    loading={loading}
                    block
                    className="h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 border-none hover:opacity-90 hover:scale-[1.02] transition-all shadow-lg shadow-purple-200 font-semibold text-lg"
                  >
                    {loading ? "กำลังวิเคราะห์..." : "ตรวจสอบทันที"}
                  </Button>
                </div>
                
                {loading && (
                  <div className="text-center mt-2 animate-pulse">
                    <Text type="secondary" className="text-xs">
                      กระบวนการนี้ทำงานอย่างปลอดภัยบนเซิร์ฟเวอร์ของเรา<br/>เราไม่มีการเก็บรหัสผ่านของคุณ
                    </Text>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {data && (
          <div className="animate-fade-in-up w-full">
            <div className="flex items-center justify-between mb-6">
                <Button 
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setData(null)} 
                    className="hover:bg-white/50 rounded-full px-4"
                >
                    กลับไปหน้าเข้าสู่ระบบ
                </Button>
                <Title level={4} className="!mb-0">ผลการวิเคราะห์</Title>
                <div className="w-20"></div> {/* Spacer for centering */}
            </div>

            <Row gutter={[24, 24]} className="mb-8">
              <Col xs={24} md={8}>
                <Card className="text-center shadow-lg border-0 rounded-2xl overflow-hidden hover:shadow-xl transition-shadow">
                  <Statistic
                    title={<span className="text-gray-500 font-medium">กำลังติดตาม</span>}
                    value={data.stats.followingCount}
                    valueStyle={{ color: '#3f8600', fontWeight: 'bold', fontSize: '2.5rem' }}
                  />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card className="text-center shadow-lg border-0 rounded-2xl overflow-hidden hover:shadow-xl transition-shadow">
                  <Statistic
                    title={<span className="text-gray-500 font-medium">ผู้ติดตาม</span>}
                    value={data.stats.followersCount}
                    valueStyle={{ color: '#1890ff', fontWeight: 'bold', fontSize: '2.5rem' }}
                  />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card className="text-center shadow-lg border-0 rounded-2xl overflow-hidden hover:shadow-xl transition-shadow bg-gradient-to-b from-red-50 to-white">
                  <Statistic
                    title={<span className="text-red-500 font-medium">ไม่ฟอลกลับ</span>}
                    value={data.stats.notFollowingBackCount}
                    valueStyle={{ color: '#cf1322', fontWeight: 'bold', fontSize: '2.5rem' }}
                  />
                </Card>
              </Col>
            </Row>

            <Card 
                title={<span className="font-bold text-lg">รายชื่อคนที่ไม่ฟอลกลับ</span>} 
                className="shadow-xl border-0 rounded-3xl overflow-hidden"
                styles={{ header: { borderBottom: '1px solid #f0f0f0', padding: '20px 24px' } }}
            >
              <List
                itemLayout="horizontal"
                dataSource={data.notFollowingBack}
                pagination={{
                  pageSize: 8,
                  position: 'bottom',
                  align: 'center',
                  className: 'pb-4'
                }}
                renderItem={(item) => (
                  <List.Item
                    className="hover:bg-gray-50 transition-colors px-6 py-4 border-b border-gray-50 last:border-0"
                    actions={[
                      <Button 
                        key="profile" 
                        type="link"
                        href={item.profileLink || `https://www.instagram.com/${item.username}`} 
                        target="_blank" 
                        className="text-blue-500 font-medium hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full px-4 h-8 flex items-center"
                      >
                        ดูโปรไฟล์
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar 
                            src={
                              item.profilePic ? (
                                <img 
                                  src={item.profilePic} 
                                  alt={item.username}
                                  referrerPolicy="no-referrer"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : null
                            }
                            icon={<UserOutlined />} 
                            size={48} 
                            className="border-2 border-white shadow-sm"
                        />
                      }
                      title={
                        <a 
                            href={item.profileLink || "#"} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-base font-semibold text-gray-800 hover:text-pink-600 transition-colors"
                        >
                            {item.username}
                        </a>
                      }
                      description={<span className="text-gray-500">{item.fullName || "Instagram User"}</span>}
                    />
                  </List.Item>
                )}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Page;