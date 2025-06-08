# 音乐管理系统 API 文档

## 基础信息

- 基础URL: `http://localhost:8080/api`
- 所有请求和响应均使用JSON格式
- 所有响应都遵循统一的格式：
```json
{
    "success": true/false,
    "message": "操作结果描述",
    "data": {} // 具体的数据内容
}
```

## 接口列表

### 1. 创建音乐

创建一个新的音乐记录。

- **URL**: `/music`
- **方法**: `POST`
- **请求体**:
```json
{
    "music_id":"音乐Id",
    "title": "音乐标题",
    "author": "作者",
    "description": "描述",
    "quality": "音质",
    "album": "专辑",
    "tags": ["标签1", "标签2"],
    "duration": "时长",
    "genre": "流派",
    "preview_cover": "预览封面URL",
    "lossless": false,
    "lyrics": "歌词",
    "cover_path": "封面文件路径",
    "audio_path": "音频文件路径"
}
```
- **响应**: 
```json
{
    "success": true,
    "message": "音乐创建成功",
    "data": {
        "music_id": "生成的UUID",
        "title": "音乐标题",
        // ... 其他字段
    }
}
```

### 2. 更新音乐

更新现有音乐的信息。

- **URL**: `/music`
- **方法**: `PUT`
- **请求体**:
```json
{
    "music_id": "要更新的音乐ID",
    "title": "新的标题",  // 可选
    "author": "新的作者",  // 可选
    // ... 其他可选字段
}
```
- **响应**:
```json
{
    "success": true,
    "message": "音乐更新成功",
    "data": {
        "music_id": "音乐ID",
        // ... 更新后的完整信息
    }
}
```

### 3. 删除音乐

删除指定ID的音乐。

- **URL**: `/music/{music_id}`
- **方法**: `DELETE`
- **URL参数**: 
  - `music_id`: 要删除的音乐ID
- **响应**:
```json
{
    "success": true,
    "message": "音乐删除成功",
    "data": null
}
```

### 4. 获取单个音乐

获取指定ID的音乐详细信息。

- **URL**: `/music/{music_id}`
- **方法**: `GET`
- **URL参数**: 
  - `music_id`: 要获取的音乐ID
- **响应**:
```json
{
    "success": true,
    "message": "操作成功",
    "data": {
        "music_id": "音乐ID",
        "title": "音乐标题",
        // ... 其他字段
    }
}
```

### 5. 获取所有音乐

获取所有音乐的列表。

- **URL**: `/music`
- **方法**: `GET`
- **响应**:
```json
{
    "success": true,
    "message": "操作成功",
    "data": [
        {
            "music_id": "音乐1 ID",
            "title": "音乐1标题",
            // ... 其他字段
        },
        {
            "music_id": "音乐2 ID",
            "title": "音乐2标题",
            // ... 其他字段
        }
    ]
}
```

### 6. 分页获取音乐

分页获取音乐列表。

- **URL**: `/music/page`
- **方法**: `GET`
- **查询参数**:
  - `page`: 页码（从0开始，默认0）
  - `size`: 每页大小（默认10）
- **响应**:
```json
{
    "success": true,
    "message": "操作成功",
    "data": {
        "content": [
            {
                "music_id": "音乐ID",
                "title": "音乐标题",
                // ... 其他字段
            }
        ],
        "totalElements": 100,
        "totalPages": 10,
        "size": 10,
        "number": 0
    }
}
```

## 错误处理

### 常见错误响应

1. **实体未找到**:
```json
{
    "success": false,
    "message": "音乐不存在",
    "data": null
}
```

2. **参数验证失败**:
```json
{
    "success": false,
    "message": "参数验证失败",
    "data": {
        "title": "标题不能为空",
        "author": "作者不能为空"
    }
}
```

3. **服务器错误**:
```json
{
    "success": false,
    "message": "服务器内部错误: [具体错误信息]",
    "data": null
}
```

## 数据模型

### Music对象

| 字段 | 类型 | 描述 |
|------|------|------|
| music_id | String | 音乐唯一标识符 |
| title | String | 音乐标题 |
| author | String | 作者 |
| description | String | 描述 |
| quality | String | 音质 |
| album | String | 专辑 |
| tags | List<String> | 标签列表 |
| duration | String | 时长 |
| genre | String | 流派 |
| preview_cover | String | 预览封面URL |
| lossless | String | 无损格式 |
| lyrics | String | 歌词 |
| cover_path | String | 封面文件路径 |
| audio_path | String | 音频文件路径 |

## 注意事项

1. 所有POST和PUT请求的Content-Type必须设置为`application/json`
2. 所有响应的Content-Type均为`application/json`
3. 文件上传大小限制为100MB
4. 服务支持CORS，允许来自所有源的请求
