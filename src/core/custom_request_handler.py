import os
import http.server

class CustomRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)

        # 如果是目录，就返回 index.html
        if os.path.isdir(path):
            for index in ["index.html", "index.htm"]:
                index_path = os.path.join(path, index)
                if os.path.exists(index_path):
                    path = index_path
                    break
            else:
                return self.list_directory(path)

        ctype = self.guess_type(path)
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, "File not found")
            return None

        fs = os.fstat(f.fileno())
        size = fs.st_size
        start = 0
        end = size - 1

        if "Range" in self.headers:
            self.send_response(206)
            range_header = self.headers["Range"]
            range_value = range_header.strip().split("=")[1]
            if "-" in range_value:
                range_start, range_end = range_value.split("-")
                if range_start:
                    start = int(range_start)
                if range_end:
                    end = int(range_end)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
        else:
            self.send_response(200)
            self.send_header("Content-Length", str(size))

        self.send_header("Content-type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

        f.seek(start)
        return f  # 让父类的 do_GET 调用 f.read() 并写入响应